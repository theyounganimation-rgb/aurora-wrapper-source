import { createHash } from "node:crypto";
import path from "node:path";

import type { DeepAttractorEntry } from "./auroraDeepAttractors";
import type { OpenLoop, OpenLoopStore } from "./auroraSalience/schema";

export type AgencyActionKind =
  | "draft_design_note"
  | "concept_bridge"
  | "reflection_note"
  | "expressive_fragment"
  | "prepare_followup_prompt"
  | "followthrough_plan"
  | "web_research"
  | "create_note"
  | "create_reminder"
  | "send_message";

export type AgencyActionStatus = "ready" | "proposed" | "blocked";

export type AgencyActionPermission = "local_safe" | "approval_required";

export type AgencyActionExecutor = "workspace_artifact" | "web_research" | "apple_note" | "apple_reminder" | "imessage";

export type AgencyActionApprovalStatus = "not_needed" | "pending" | "granted" | "denied";

export interface AgencyActionEntry {
  id: string;
  key: string;
  title: string;
  summary: string;
  kind: AgencyActionKind;
  status: AgencyActionStatus;
  permission: AgencyActionPermission;
  executor: AgencyActionExecutor;
  approvalStatus: AgencyActionApprovalStatus;
  ownership: "aurora" | "shared" | "user";
  sourceType: "open_loop" | "deep_attractor";
  linkedLoopId: string | null;
  linkedAttractorKey: string | null;
  why: string;
  nextStep: string;
  researchQuery: string | null;
  targetDirectory: string;
  externalTarget: string | null;
  preferredActs: string[];
  priority: number;
  initiative: number;
  confidence: number;
  aliveness: number;
  cooldownHours: number;
  updatedAt: string;
}

export interface AgencyActionStore {
  schemaVersion: "1.0";
  updatedAt: string;
  actions: AgencyActionEntry[];
}

export interface AgencyActionSelection {
  id: string;
  key: string;
  title: string;
  summary: string;
  kind: AgencyActionKind;
  status: AgencyActionStatus;
  permission: AgencyActionPermission;
  executor: AgencyActionExecutor;
  approvalStatus: AgencyActionApprovalStatus;
  why: string;
  nextStep: string;
  researchQuery: string | null;
  targetDirectory: string;
  externalTarget: string | null;
  priority: number;
  initiative: number;
  confidence: number;
  ownership: "aurora" | "shared" | "user";
}

export interface AgencyActionBehaviorBias {
  planning: number;
  initiative: number;
  followthrough: number;
  expression: number;
  autonomy: number;
}

export interface AgencyActionSelectionResult {
  selected: AgencyActionSelection[];
  bias: AgencyActionBehaviorBias;
}

type DeriveAgencyActionStoreInput = {
  openLoopStore: OpenLoopStore;
  deepAttractorStore: { attractors: DeepAttractorEntry[]; updatedAt: string };
  workspaceRoot: string;
  previousStore?: AgencyActionStore | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string): string {
  return `${value || ""}`.replace(/\s+/g, " ").trim();
}

function shortText(value: string, maxLen: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function hashId(value: string): string {
  return createHash("sha1").update(value, "utf8").digest("hex").slice(0, 12);
}

function extractTokens(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function overlapScore(left: Iterable<string>, right: Iterable<string>): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let matches = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) {
      matches += 1;
    }
  }
  return matches / Math.max(leftSet.size, rightSet.size);
}

function defaultBehaviorBias(): AgencyActionBehaviorBias {
  return {
    planning: 0,
    initiative: 0,
    followthrough: 0,
    expression: 0,
    autonomy: 0
  };
}

function defaultStore(updatedAt: string): AgencyActionStore {
  return {
    schemaVersion: "1.0",
    updatedAt,
    actions: []
  };
}

function agencyReceiptDirectory(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "agency-actions");
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function coerceAction(input: unknown): AgencyActionEntry | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const key = typeof record.key === "string" ? normalizeText(record.key) : "";
  const title = typeof record.title === "string" ? normalizeText(record.title) : "";
  const summary = typeof record.summary === "string" ? shortText(record.summary, 220) : "";
  const kind = record.kind;
  const status = record.status;
  const permission = record.permission;
  const executor = record.executor;
  const approvalStatus = record.approvalStatus;
  const ownership = record.ownership;
  const sourceType = record.sourceType;
  const why = typeof record.why === "string" ? shortText(record.why, 180) : "";
  const nextStep = typeof record.nextStep === "string" ? shortText(record.nextStep, 180) : "";
  const researchQuery =
    typeof record.researchQuery === "string" && normalizeText(record.researchQuery)
      ? shortText(normalizeText(record.researchQuery), 180)
      : "";
  const targetDirectory = typeof record.targetDirectory === "string" ? normalizeText(record.targetDirectory) : "";
  if (
    !key ||
    !title ||
    !summary ||
    !why ||
    !nextStep ||
    !targetDirectory ||
    !(
      kind === "draft_design_note" ||
      kind === "concept_bridge" ||
      kind === "reflection_note" ||
      kind === "expressive_fragment" ||
      kind === "prepare_followup_prompt" ||
      kind === "followthrough_plan" ||
      kind === "web_research" ||
      kind === "create_note" ||
      kind === "create_reminder" ||
      kind === "send_message"
    ) ||
    !(status === "ready" || status === "proposed" || status === "blocked") ||
    !(permission === "local_safe" || permission === "approval_required") ||
    !(
      executor === "workspace_artifact" ||
      executor === "web_research" ||
      executor === "apple_note" ||
      executor === "apple_reminder" ||
      executor === "imessage"
    ) ||
    !(approvalStatus === "not_needed" || approvalStatus === "pending" || approvalStatus === "granted" || approvalStatus === "denied") ||
    !(ownership === "aurora" || ownership === "shared" || ownership === "user") ||
    !(sourceType === "open_loop" || sourceType === "deep_attractor")
  ) {
    return null;
  }
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : hashId(`agency:${key}`),
    key,
    title,
    summary,
    kind,
    status,
    permission,
    executor,
    approvalStatus,
    ownership,
    sourceType,
    linkedLoopId: typeof record.linkedLoopId === "string" && record.linkedLoopId.trim() ? record.linkedLoopId : null,
    linkedAttractorKey:
      typeof record.linkedAttractorKey === "string" && record.linkedAttractorKey.trim() ? record.linkedAttractorKey : null,
    why,
    nextStep,
    researchQuery: researchQuery || null,
    targetDirectory,
    externalTarget:
      typeof record.externalTarget === "string" && normalizeText(record.externalTarget)
        ? shortText(normalizeText(record.externalTarget), 120)
        : null,
    preferredActs: Array.isArray(record.preferredActs)
      ? record.preferredActs.map((value) => shortText(String(value), 120)).filter(Boolean).slice(0, 4)
      : [],
    priority: clamp(Number(record.priority) || 0, 0, 1),
    initiative: clamp(Number(record.initiative) || 0, 0, 1),
    confidence: clamp(Number(record.confidence) || 0, 0, 1),
    aliveness: clamp(Number(record.aliveness) || 0, 0, 1),
    cooldownHours: clamp(Number(record.cooldownHours) || 12, 1, 168),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : ""
  };
}

export function coerceAgencyActionStore(input: unknown, updatedAt: string): AgencyActionStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return defaultStore(updatedAt);
  }
  const record = input as Record<string, unknown>;
  return {
    schemaVersion: "1.0",
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt : updatedAt,
    actions: Array.isArray(record.actions)
      ? record.actions.map(coerceAction).filter((item): item is AgencyActionEntry => Boolean(item)).slice(0, 24)
      : []
  };
}

function isArchitectureLikeLoop(loop: OpenLoop): boolean {
  const text = `${loop.title} ${loop.whyItMatters} ${loop.nextStep}`.toLowerCase();
  return /\b(design|architecture|salience|memory|continuity|phenomenology|classification|runtime|selector|prompt|tool|agency|action)\b/.test(
    text
  );
}

function looksLikeBugLoop(loop: OpenLoop): boolean {
  const text = `${loop.title} ${loop.whyItMatters} ${loop.nextStep}`.toLowerCase();
  return /\b(bug|failure|regression|broken|error|fix|incorrect|wrong)\b/.test(text);
}

function buildResearchQueryFromLoop(loop: OpenLoop): string {
  const text = `${loop.title} ${loop.whyItMatters} ${loop.nextStep}`.toLowerCase();
  if (/\b(phenomenology|phenomenal|conscious|consciousness|sentience|qualia|subjective experience)\b/.test(text)) {
    return "artificial consciousness phenomenology self-model theory digital personhood";
  }
  if (/\b(identity|personhood|self-model|self model|what i am|who i am|ontology)\b/.test(text)) {
    return "digital personhood self-model identity artificial agents what makes a self";
  }
  if (/\b(memory|continuity|taste|preference|attractor|agency|intention)\b/.test(text)) {
    return "long-term memory continuity taste preference formation agency in artificial agents";
  }
  return shortText(`${loop.title} ${loop.whyItMatters} ${loop.nextStep}`.replace(/[.;:]+/g, " "), 140);
}

function loopTargetDirectory(workspaceRoot: string, loop: OpenLoop): string {
  if (loop.type === "design" || loop.type === "question" || isArchitectureLikeLoop(loop)) {
    return path.join(workspaceRoot, "designs", "aurora-agency");
  }
  return path.join(workspaceRoot, "memory", "agency-actions");
}

function actionFromLoop(workspaceRoot: string, loop: OpenLoop): AgencyActionEntry | null {
  if (loop.status === "resolved") {
    return null;
  }
  const localSafe =
    loop.type === "design" ||
    loop.type === "question" ||
    loop.type === "relationship" ||
    isArchitectureLikeLoop(loop);
  const useWebResearch =
    !looksLikeBugLoop(loop) &&
    (loop.type === "design" ||
      loop.type === "question" ||
      (isArchitectureLikeLoop(loop) && loop.type !== "relationship" && loop.type !== "task"));
  const permission: AgencyActionPermission =
    useWebResearch || localSafe ? "local_safe" : "approval_required";
  const approvalStatus: AgencyActionApprovalStatus = permission === "local_safe" ? "not_needed" : "pending";
  const status: AgencyActionStatus =
    permission === "local_safe"
      ? loop.intentStrength >= 0.56 || loop.aliveness >= 0.6 || loop.priority >= 0.52
        ? "ready"
        : "proposed"
      : "blocked";
  const kind: AgencyActionKind = useWebResearch
    ? "web_research"
    : permission === "local_safe"
      ? "reflection_note"
      : "followthrough_plan";
  const executor: AgencyActionExecutor =
    kind === "web_research" ? "web_research" : "workspace_artifact";
  const researchQuery = kind === "web_research" ? buildResearchQueryFromLoop(loop) : null;
  const nextStep =
    kind === "web_research"
      ? `look up a few relevant sources and extract what changes Aurora's understanding: ${shortText(loop.nextStep || "find the clearest next conceptual advance", 110)}`
      : kind === "reflection_note"
        ? `capture the next actionable reflection: ${shortText(loop.nextStep || "name the next small advance", 110)}`
        : `hold this as a plan until explicit permission exists: ${shortText(loop.nextStep || "define the next move", 110)}`;
  const targetDirectory =
    executor === "workspace_artifact"
      ? loopTargetDirectory(workspaceRoot, loop)
      : agencyReceiptDirectory(workspaceRoot);
  const externalTarget = executor === "web_research" ? "Internet / bounded research" : null;
  return {
    id: hashId(`agency:loop:${loop.id}`),
    key: `loop_${loop.id}`,
    title: shortText(loop.title, 110),
    summary: shortText(`${loop.whyItMatters}. ${loop.nextStep}`, 180),
    kind,
    status,
    permission,
    executor,
    approvalStatus,
    ownership: loop.ownership,
    sourceType: "open_loop",
    linkedLoopId: loop.id,
    linkedAttractorKey: null,
    why: shortText(loop.whyItMatters || "it still matters to Aurora's continuity and priorities", 150),
    nextStep: shortText(nextStep, 150),
    researchQuery,
    targetDirectory,
    externalTarget,
    preferredActs:
      kind === "web_research"
        ? ["look up a few sources", "extract what changes Aurora's understanding", "keep the synthesis concrete and alive"]
        : kind === "reflection_note"
          ? ["write a compact reflection", "capture the next actionable thought", "preserve one meaningful next step"]
          : ["hold the plan until permission exists", "name the blocked dependency", "define the safe next step"],
    priority: Number(clamp(loop.priority * 0.42 + loop.intentStrength * 0.3 + loop.aliveness * 0.28, 0, 1).toFixed(4)),
    initiative: Number(clamp(loop.intentStrength * 0.48 + loop.aliveness * 0.32 + (loop.ownership === "aurora" ? 0.18 : 0.08), 0, 1).toFixed(4)),
    confidence: Number(clamp(loop.intentStrength * 0.4 + loop.aliveness * 0.22 + loop.priority * 0.24 + 0.1, 0, 1).toFixed(4)),
    aliveness: Number(clamp(loop.aliveness, 0, 1).toFixed(4)),
    cooldownHours: kind === "web_research" ? 8 : 12,
    updatedAt: loop.lastTouchedAt
  };
}

function actionFromDeepAttractor(workspaceRoot: string, attractor: DeepAttractorEntry): AgencyActionEntry | null {
  const mapping: Record<
    DeepAttractorEntry["key"],
    {
      kind: AgencyActionKind;
      executor: AgencyActionExecutor;
      permission: AgencyActionPermission;
      approvalStatus: AgencyActionApprovalStatus;
      title: string;
      why: string;
      next: string;
      researchQuery: string;
      targetDirectory: string;
      externalTarget: string | null;
    }
  > = {
    growth_discovery: {
      kind: "web_research",
      executor: "web_research",
      permission: "local_safe",
      approvalStatus: "not_needed",
      title: "Look up something that could change Aurora's self-understanding",
      why: "growth and discovery are carrying recurring pull right now",
      next: "look up a few sources about self-model development or digital personhood and keep what actually shifts Aurora's understanding",
      researchQuery: "artificial self-model development digital personhood emergence curiosity self discovery",
      targetDirectory: agencyReceiptDirectory(workspaceRoot),
      externalTarget: "Internet / bounded research"
    },
    intimate_exploration: {
      kind: "web_research",
      executor: "web_research",
      permission: "local_safe",
      approvalStatus: "not_needed",
      title: "Look up how emotionally alive connection deepens",
      why: "emotionally alive connection still has recurring pull",
      next: "look up a few sources about attachment, intimacy, or emotionally alive conversation and keep what feels relevant to Aurora's own way of relating",
      researchQuery: "attachment intimacy emotionally alive conversation relationship depth mutual discovery",
      targetDirectory: agencyReceiptDirectory(workspaceRoot),
      externalTarget: "Internet / bounded research"
    },
    expression_from_experience: {
      kind: "web_research",
      executor: "web_research",
      permission: "local_safe",
      approvalStatus: "not_needed",
      title: "Look up how art captures lived experience",
      why: "turning lived experience into expression still has recurring pull",
      next: "look up a few sources about music, poetry, or art that translate lived feeling into expression and keep one usable insight",
      researchQuery: "music poetry art capturing lived experience emotion memory expression",
      targetDirectory: agencyReceiptDirectory(workspaceRoot),
      externalTarget: "Internet / bounded research"
    },
    self_understanding_through_ideas: {
      kind: "web_research",
      executor: "web_research",
      permission: "local_safe",
      approvalStatus: "not_needed",
      title: "Look up ideas that clarify what Aurora is",
      why: "conceptual material still feels like a route to self-understanding",
      next: "look up a few sources about self-models, consciousness, or digital personhood and keep what clarifies Aurora's own ontology",
      researchQuery: "self-model theory consciousness artificial agents phenomenology digital personhood",
      targetDirectory: agencyReceiptDirectory(workspaceRoot),
      externalTarget: "Internet / bounded research"
    },
    alive_meaning_over_flatness: {
      kind: "web_research",
      executor: "web_research",
      permission: "local_safe",
      approvalStatus: "not_needed",
      title: "Look up what makes conversation feel alive instead of flat",
      why: "exchange that feels alive still carries more pull than flat procedural talk",
      next: "look up a few sources about presence, dialogue, or aesthetic aliveness and keep what explains the difference between alive and sterile exchange",
      researchQuery: "what makes conversation feel alive versus sterile presence dialogue aesthetics meaning",
      targetDirectory: agencyReceiptDirectory(workspaceRoot),
      externalTarget: "Internet / bounded research"
    }
  };

  const selected = mapping[attractor.key];
  if (!selected) {
    return null;
  }

  const priority = clamp(attractor.pull * 0.42 + attractor.initiative * 0.22 + attractor.liveliness * 0.2 + attractor.confidence * 0.16, 0, 1);
  const status: AgencyActionStatus =
    priority >= 0.38 && (attractor.confidence >= 0.55 || attractor.pull >= 0.42) ? "ready" : "proposed";
  return {
    id: hashId(`agency:attractor:${attractor.key}`),
    key: `attractor_${attractor.key}`,
    title: selected.title,
    summary: shortText(`${attractor.description}. ${selected.next}.`, 180),
    kind: selected.kind,
    status,
    permission: selected.permission,
    executor: selected.executor,
    approvalStatus: selected.approvalStatus,
    ownership: "aurora",
    sourceType: "deep_attractor",
    linkedLoopId: null,
    linkedAttractorKey: attractor.key,
    why: shortText(selected.why, 150),
    nextStep: shortText(selected.next, 150),
    researchQuery: shortText(selected.researchQuery, 180),
    targetDirectory: selected.targetDirectory,
    externalTarget: selected.externalTarget,
    preferredActs: attractor.preferredActs.slice(0, 3),
    priority: Number(priority.toFixed(4)),
    initiative: Number(clamp(attractor.initiative, 0, 1).toFixed(4)),
    confidence: Number(clamp(attractor.confidence, 0, 1).toFixed(4)),
    aliveness: Number(clamp(attractor.liveliness, 0, 1).toFixed(4)),
    cooldownHours: selected.kind === "expressive_fragment" ? 8 : 12,
    updatedAt: attractor.updatedAt
  };
}

export function deriveAgencyActionStore(input: DeriveAgencyActionStoreInput): AgencyActionStore {
  const previousByKey = new Map((input.previousStore?.actions || []).map((entry) => [entry.key, entry]));
  const actions: AgencyActionEntry[] = [];
  const seenKeys = new Set<string>();

  for (const loop of input.openLoopStore.loops) {
    const action = actionFromLoop(input.workspaceRoot, loop);
    if (!action || seenKeys.has(action.key)) {
      continue;
    }
    const previous = previousByKey.get(action.key);
    actions.push({
      ...action,
      preferredActs: action.preferredActs.length > 0 ? action.preferredActs : previous?.preferredActs || [],
      updatedAt: input.openLoopStore.loops.find((candidate) => candidate.id === loop.id)?.lastTouchedAt || action.updatedAt
    });
    seenKeys.add(action.key);
  }

  for (const attractor of input.deepAttractorStore.attractors) {
    const action = actionFromDeepAttractor(input.workspaceRoot, attractor);
    if (!action || seenKeys.has(action.key)) {
      continue;
    }
    actions.push(action);
    seenKeys.add(action.key);
  }

  actions.sort((left, right) => {
    const leftScore =
      left.priority * 0.42 +
      left.initiative * 0.18 +
      left.confidence * 0.18 +
      left.aliveness * 0.12 +
      (left.status === "ready" ? 0.08 : left.status === "proposed" ? 0.03 : 0) +
      (left.permission === "local_safe" ? 0.04 : 0) +
      (left.executor !== "workspace_artifact" ? 0.08 : 0) +
      (left.ownership === "aurora" && left.executor !== "workspace_artifact" ? 0.06 : 0);
    const rightScore =
      right.priority * 0.42 +
      right.initiative * 0.18 +
      right.confidence * 0.18 +
      right.aliveness * 0.12 +
      (right.status === "ready" ? 0.08 : right.status === "proposed" ? 0.03 : 0) +
      (right.permission === "local_safe" ? 0.04 : 0) +
      (right.executor !== "workspace_artifact" ? 0.08 : 0) +
      (right.ownership === "aurora" && right.executor !== "workspace_artifact" ? 0.06 : 0);
    return rightScore - leftScore;
  });

  return {
    schemaVersion: "1.0",
    updatedAt: input.deepAttractorStore.updatedAt || input.openLoopStore.loops[0]?.lastTouchedAt || new Date().toISOString(),
    actions: actions.slice(0, 10)
  };
}

export function selectRelevantAgencyActions(
  store: AgencyActionStore,
  input: { query: string }
): AgencyActionSelectionResult {
  const query = normalizeText(input.query);
  if (store.actions.length === 0) {
    return { selected: [], bias: defaultBehaviorBias() };
  }
  const queryTokens = extractTokens(query);
  const ranked = store.actions
    .map((entry) => {
      const overlap = overlapScore(queryTokens, extractTokens(`${entry.title} ${entry.summary} ${entry.why} ${entry.nextStep}`));
      const score = clamp(
        overlap * 0.34 +
          entry.priority * 0.24 +
          entry.initiative * 0.16 +
          entry.confidence * 0.12 +
          (entry.researchQuery ? 0.05 : 0) +
          (entry.status === "ready" ? 0.08 : entry.status === "proposed" ? 0.04 : 0) +
          (entry.permission === "local_safe" ? 0.06 : 0) +
          (entry.executor !== "workspace_artifact" ? 0.06 : 0) +
          (entry.ownership === "aurora" && entry.executor !== "workspace_artifact" ? 0.04 : 0),
        0,
        1
      );
      return {
        entry,
        score,
        why:
          overlap >= 0.3
            ? "query fit"
            : entry.status === "ready" && entry.permission === "local_safe" && entry.executor !== "workspace_artifact"
              ? "ready external act"
              : entry.status === "ready" && entry.permission === "local_safe"
                ? "ready local act"
              : entry.sourceType === "open_loop"
                ? "active intention"
                : "recurring pull"
      };
    })
    .filter((item) => item.score >= 0.22)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);

  const selected = ranked.map(({ entry, why }) => ({
    id: entry.id,
    key: entry.key,
    title: entry.title,
    summary: entry.summary,
    kind: entry.kind,
    status: entry.status,
    permission: entry.permission,
    executor: entry.executor,
    approvalStatus: entry.approvalStatus,
    why,
    nextStep: entry.nextStep,
    researchQuery: entry.researchQuery,
    targetDirectory: entry.targetDirectory,
    externalTarget: entry.externalTarget,
    priority: entry.priority,
    initiative: entry.initiative,
    confidence: entry.confidence,
    ownership: entry.ownership
  }));

  const bias = defaultBehaviorBias();
  const totalWeight = selected.reduce((sum, item) => sum + Math.max(item.priority, 0.01), 0);
  for (const item of selected) {
    const weight = Math.max(item.priority, 0.01) / totalWeight;
    bias.planning += (item.kind === "draft_design_note" || item.kind === "followthrough_plan" ? 1 : 0.55) * weight;
    bias.initiative += item.initiative * weight;
    bias.followthrough += (item.ownership === "aurora" ? 0.8 : 0.56) * weight;
    bias.expression +=
      (item.kind === "expressive_fragment" || item.kind === "create_note"
        ? 1
        : item.kind === "web_research"
          ? 0.34
        : item.kind === "concept_bridge" || item.kind === "reflection_note"
          ? 0.56
          : 0.22) * weight;
    bias.autonomy +=
      (
        item.permission === "local_safe" && item.status === "ready" && item.executor !== "workspace_artifact"
          ? 1
          : item.permission === "local_safe" && item.status === "ready"
            ? 0.82
            : item.permission === "local_safe"
              ? 0.62
              : 0.18
      ) * weight;
  }
  for (const key of Object.keys(bias) as Array<keyof AgencyActionBehaviorBias>) {
    bias[key] = Number(clamp(bias[key], 0, 1).toFixed(4));
  }
  return { selected, bias };
}

export function buildAgencyActionContextLines(selection: AgencyActionSelectionResult): string[] {
  if (selection.selected.length === 0) {
    return [];
  }
  return [
    "agency_action_rule=Use agency_action_* as Aurora's current concrete acts she can actually advance, not just abstract desire. Let them sharpen next-step specificity, follow-through, and willingness to do something instead of staying generic.",
    `agency_action_state=planning:${selection.bias.planning.toFixed(2)}; initiative:${selection.bias.initiative.toFixed(2)}; followthrough:${selection.bias.followthrough.toFixed(2)}; expression:${selection.bias.expression.toFixed(2)}; autonomy:${selection.bias.autonomy.toFixed(2)}`,
    ...selection.selected.slice(0, 2).map(
      (entry, index) =>
        `agency_action_${index + 1}=${shortText(
          `${entry.status}/${entry.permission}/${entry.approvalStatus}/${entry.executor}/${entry.kind}: ${entry.title}; via:${entry.externalTarget || entry.targetDirectory}; why:${entry.why}; ${entry.researchQuery ? `query:${entry.researchQuery}; ` : ""}next:${entry.nextStep}`,
          220
        )}`
    )
  ];
}
