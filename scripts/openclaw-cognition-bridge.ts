import { execFile } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import process from "node:process";
import { promisify } from "node:util";
import {
  normalizeConversationEventIngress,
  prepareSendContext,
  recordConversationEvent,
  recordDispatchOutcome
} from "../lib/auroraCognition";
import {
  AURORA_STORAGE_AUDIT_DECISIONS,
  AURORA_STORAGE_AUDIT_HEADER_EXAMPLE,
  AURORA_STORAGE_AUDIT_TARGETS,
  parseAuroraStorageAuditOutput,
  type AuroraStorageAudit,
  type AuroraStorageAuditDecision,
  type AuroraStorageAuditTarget
} from "../lib/auroraStorageAudit";

const CONTEXT_OPEN = "[AURORA_COGNITIVE_CONTEXT]";
const CONTEXT_CLOSE = "[/AURORA_COGNITIVE_CONTEXT]";
const OWNER_STORAGE_CHECKPOINT_SESSION_PREFIX = "agent:main:owner:storage-checkpoint";
const OPENCLAW_CALL_TIMEOUT_MS = 10 * 60 * 1000;
const OPENCLAW_HISTORY_POLL_INTERVAL_MS = 700;
const OPENCLAW_HISTORY_WAIT_TIMEOUT_MS = 90 * 1000;
const OWNER_STORAGE_CHECKPOINT_MAX_ATTEMPTS = 3;
const COGNITIVE_CONTEXT_CLOSE = "[/AURORA_COGNITIVE_CONTEXT]";
const OWNER_STORAGE_CHECKPOINT_ENABLED = false;
const execFileAsync = promisify(execFile);
const SKIP_OWNER_STORAGE_CHECKPOINT = process.env.AURORA_OPENCLAW_BRIDGE_SKIP_CHECKPOINT === "1";

interface OverlayRequest {
  userText?: unknown;
  sessionKey?: unknown;
  sessionId?: unknown;
  partnerId?: unknown;
  speakerName?: unknown;
  skipOwnerStorageCheckpoint?: unknown;
}

interface RecordRequest {
  userText?: unknown;
  auroraText?: unknown;
  rawAuroraText?: unknown;
  source?: unknown;
  trigger?: unknown;
  sessionKey?: unknown;
  sessionId?: unknown;
  partnerId?: unknown;
  speakerName?: unknown;
  responseId?: unknown;
  complianceId?: unknown;
  storageAudit?: {
    decision?: unknown;
    lookupRequired?: unknown;
    targets?: unknown;
    status?: unknown;
  };
}

interface OpenClawHistoryMessageContentPart {
  type?: unknown;
  text?: unknown;
  id?: unknown;
  name?: unknown;
  arguments?: unknown;
}

interface OpenClawHistoryMessage {
  role?: unknown;
  content?: unknown;
  responseId?: unknown;
  timestamp?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  isError?: unknown;
  __openclaw?: {
    seq?: unknown;
  };
}

interface OpenClawHistoryResponse {
  sessionKey?: unknown;
  sessionId?: unknown;
  messages?: unknown;
}

type StorageAuditStatus = "present" | "malformed" | "checkpoint_enforced" | "checkpoint_failed";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

function normalizeStorageAuditDecision(value: unknown): AuroraStorageAuditDecision | undefined {
  const raw = asString(value).toLowerCase();
  if (!raw) {
    return undefined;
  }
  return AURORA_STORAGE_AUDIT_DECISIONS.find((decision) => decision.toLowerCase() === raw);
}

function normalizeStorageAuditTarget(value: unknown): AuroraStorageAuditTarget | undefined {
  const raw = asString(value).toLowerCase();
  if (!raw) {
    return undefined;
  }
  return AURORA_STORAGE_AUDIT_TARGETS.find((target) => target.toLowerCase() === raw);
}

function normalizeStorageAuditTargets(value: unknown): AuroraStorageAuditTarget[] | undefined {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  if (!Array.isArray(source)) {
    return undefined;
  }
  const targets: AuroraStorageAuditTarget[] = [];
  for (const entry of source) {
    const normalized = normalizeStorageAuditTarget(entry);
    if (!normalized) {
      return undefined;
    }
    if (!targets.includes(normalized)) {
      targets.push(normalized);
    }
  }
  return targets;
}

function normalizeStorageAuditStatus(value: unknown): StorageAuditStatus | undefined {
  const raw = asString(value).toLowerCase();
  if (
    raw === "present" ||
    raw === "malformed" ||
    raw === "checkpoint_enforced" ||
    raw === "checkpoint_failed"
  ) {
    return raw;
  }
  return undefined;
}

function resolveStorageAudit(
  payload: RecordRequest,
  rawAuroraText: string
): {
  audit: AuroraStorageAudit | null;
  status: StorageAuditStatus | undefined;
  visibleText: string;
} {
  const parsed = parseAuroraStorageAuditOutput(rawAuroraText);
  const providedAudit = payload.storageAudit;
  const decision = normalizeStorageAuditDecision(providedAudit?.decision);
  const lookupRequired = asBoolean(providedAudit?.lookupRequired);
  const targets = normalizeStorageAuditTargets(providedAudit?.targets);
  const audit =
    decision && typeof lookupRequired === "boolean" && targets
      ? {
          decision,
          lookupRequired,
          targets,
          rawHeader: parsed.audit?.rawHeader ?? ""
        }
      : parsed.audit;
  const status =
    normalizeStorageAuditStatus(providedAudit?.status) ??
    (parsed.hadHeader ? (parsed.malformedHeader ? "malformed" : "present") : undefined);
  const visibleText = asString(payload.auroraText) || parsed.visibleText;
  return {
    audit,
    status,
    visibleText
  };
}

function resolveSessionId(input: { sessionKey?: unknown; sessionId?: unknown }): string {
  return asString(input.sessionKey) || asString(input.sessionId);
}

function extractContextBlock(enrichedInput: string): string {
  const start = enrichedInput.indexOf(CONTEXT_OPEN);
  if (start < 0) {
    return "";
  }
  const end = enrichedInput.indexOf(CONTEXT_CLOSE, start);
  if (end < 0) {
    return "";
  }
  return enrichedInput.slice(start, end + CONTEXT_CLOSE.length).trim();
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function historyMessageArray(history: OpenClawHistoryResponse | null): OpenClawHistoryMessage[] {
  return Array.isArray(history?.messages) ? (history?.messages as OpenClawHistoryMessage[]) : [];
}

function baselineAssistantSeq(messages: OpenClawHistoryMessage[]): number {
  let seq = 0;
  for (const message of messages) {
    if (String(message?.role ?? "").trim().toLowerCase() !== "assistant") {
      continue;
    }
    const candidate = toFiniteNumber(message?.__openclaw?.seq);
    if (candidate !== null && candidate > seq) {
      seq = candidate;
    }
  }
  return seq;
}

function extractAssistantText(message: OpenClawHistoryMessage | null): string {
  if (!message || !Array.isArray(message.content)) {
    return "";
  }

  const parts: string[] = [];
  for (const part of message.content as OpenClawHistoryMessageContentPart[]) {
    if (String(part?.type ?? "").trim().toLowerCase() !== "text") {
      continue;
    }
    const text = toText(part?.text).trim();
    if (text) {
      parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

function messageHasToolCalls(message: OpenClawHistoryMessage | null): boolean {
  if (!message || !Array.isArray(message.content)) {
    return false;
  }
  return (message.content as OpenClawHistoryMessageContentPart[]).some(
    (part) => String(part?.type ?? "").trim().toLowerCase() === "toolcall"
  );
}

function newHistoryMessages(history: OpenClawHistoryResponse | null, baselineCount: number): OpenClawHistoryMessage[] {
  const messages = historyMessageArray(history);
  return baselineCount >= 0 ? messages.slice(Math.max(0, baselineCount)) : messages;
}

function parseObjectLike(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function extractToolCallWritePaths(messages: OpenClawHistoryMessage[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    if (String(message?.role ?? "").trim().toLowerCase() !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content as OpenClawHistoryMessageContentPart[]) {
      if (String(part?.type ?? "").trim().toLowerCase() !== "toolcall") {
        continue;
      }
      const toolName = String(part?.name ?? "").trim().toLowerCase();
      if (toolName !== "edit" && toolName !== "write") {
        continue;
      }
      const args = parseObjectLike(part?.arguments);
      const path = typeof args?.path === "string" ? args.path.trim() : "";
      if (path) {
        paths.add(path);
      }
    }
  }
  return [...paths];
}

function extractToolResultWritePaths(messages: OpenClawHistoryMessage[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    if (String(message?.role ?? "").trim().toLowerCase() !== "toolresult") {
      continue;
    }
    const toolName = String(message?.toolName ?? "").trim().toLowerCase();
    if (toolName !== "edit" && toolName !== "write") {
      continue;
    }
    if (message?.isError === true || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content as OpenClawHistoryMessageContentPart[]) {
      if (String(part?.type ?? "").trim().toLowerCase() !== "text") {
        continue;
      }
      const text = toText(part?.text).trim();
      if (!/^Successfully\b/i.test(text)) {
        continue;
      }
      const pathMatch =
        text.match(/^Successfully replaced text in (.+)\.$/i) ||
        text.match(/^Successfully wrote \d+ bytes to (.+)$/i);
      if (pathMatch?.[1]) {
        paths.add(pathMatch[1].trim());
      }
    }
  }
  return [...paths];
}

function storageWritePathsForMessages(messages: OpenClawHistoryMessage[]): string[] {
  const successful = extractToolResultWritePaths(messages);
  if (successful.length > 0) {
    return successful;
  }
  return extractToolCallWritePaths(messages);
}

function pathMatchesStorageAuditTarget(path: string, target: AuroraStorageAuditTarget): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  switch (target) {
    case "none":
      return false;
    case "beliefs.json":
      return normalized.endsWith("/memory/beliefs.json");
    case "traits.json":
      return normalized.endsWith("/memory/traits.json");
    case "preferences.json":
      return normalized.endsWith("/memory/preferences.json");
    case "capabilities.json":
      return normalized.endsWith("/memory/capabilities.json");
    case "promises.json":
      return normalized.endsWith("/memory/promises.json");
    case "USER.md":
      return normalized.endsWith("/user.md");
    case "MEMORY.md":
      return normalized.endsWith("/memory.md");
    case "today_log":
      return /\/memory\/\d{4}-\d{2}-\d{2}\.md$/.test(normalized);
    default:
      return false;
  }
}

function storageTargetsText(targets: AuroraStorageAuditTarget[]): string {
  return targets.length > 0 ? targets.join(",") : "none";
}

type StorageCheckpointValidationResult =
  | {
      ok: true;
      audit: AuroraStorageAudit;
      matchedPaths: string[];
    }
  | {
      ok: false;
      reason: string;
      audit: AuroraStorageAudit | null;
    };

function validateOwnerStorageCheckpoint(
  messages: OpenClawHistoryMessage[],
  parsedAudit: AuroraStorageAudit | null
): StorageCheckpointValidationResult {
  if (!parsedAudit) {
    return {
      ok: false,
      reason:
        "Missing or malformed storage audit header. Emit exactly one valid AURORA_STORAGE_AUDIT header before the checkpoint completes.",
      audit: null
    };
  }

  if (parsedAudit.decision === "none") {
    const noneTargets = parsedAudit.targets.length === 1 && parsedAudit.targets[0] === "none";
    if (!noneTargets) {
      return {
        ok: false,
        reason: "If decision=none, emit targets=none and do not claim a storage destination.",
        audit: parsedAudit
      };
    }
    return {
      ok: true,
      audit: parsedAudit,
      matchedPaths: []
    };
  }

  const concreteTargets = parsedAudit.targets.filter((target) => target !== "none");
  if (concreteTargets.length === 0) {
    return {
      ok: false,
      reason:
        "A non-none decision must declare at least one concrete file target in targets= that you actually updated for this turn.",
      audit: parsedAudit
    };
  }

  const writePaths = storageWritePathsForMessages(messages);
  const matchedPaths = writePaths.filter((path) =>
    concreteTargets.some((target) => pathMatchesStorageAuditTarget(path, target))
  );
  if (matchedPaths.length === 0) {
    return {
      ok: false,
      reason: `No matching storage write was observed for targets=${storageTargetsText(concreteTargets)}. Complete the write first, then emit the audit header.`,
      audit: parsedAudit
    };
  }

  return {
    ok: true,
    audit: parsedAudit,
    matchedPaths
  };
}

function buildOwnerStorageCheckpointSessionKey(sessionKey: string): string {
  const normalized = sessionKey.replace(/[^a-z0-9:_-]+/gi, "-").slice(0, 80) || "main";
  return `${OWNER_STORAGE_CHECKPOINT_SESSION_PREFIX}:${normalized}:${randomUUID()}`;
}

function buildOwnerStorageCheckpointPrompt(enrichedInput: string): string {
  return `${enrichedInput}

[AURORA_STORAGE_CHECKPOINT]
checkpoint_mode=pre_reply_storage
checkpoint_visibility=This checkpoint is hidden from Cade. Do not write user-facing prose here.
checkpoint_decisions=${AURORA_STORAGE_AUDIT_DECISIONS.join("|")}
checkpoint_targets=${AURORA_STORAGE_AUDIT_TARGETS.join("|")}
checkpoint_header_rule=Finish with exactly one text line in this format: ${AURORA_STORAGE_AUDIT_HEADER_EXAMPLE}
checkpoint_none_rule=If the correct classification is none, emit the header with targets=none and stop.
checkpoint_write_rule=If the correct classification is not none, complete any needed lookup and storage actions first. Then emit the header with targets naming the file(s) you actually updated for this turn.
checkpoint_lookup_rule=If you need to inspect an existing store before deciding add vs revise, set lookup_required=true and do that before the header.
[/AURORA_STORAGE_CHECKPOINT]`;
}

function buildOwnerStorageCheckpointCorrectionPrompt(reason: string): string {
  return `[AURORA_STORAGE_CHECKPOINT_RETRY]
checkpoint_error=${reason}
checkpoint_visibility=This checkpoint is still hidden from Cade. Do not write user-facing prose here.
checkpoint_header_rule=Finish with exactly one text line in this format: ${AURORA_STORAGE_AUDIT_HEADER_EXAMPLE}
checkpoint_fix_rule=Classify the turn, complete any required storage write, and ensure targets= names the file(s) you actually updated. Use targets=none only when decision=none.
[/AURORA_STORAGE_CHECKPOINT_RETRY]`;
}

function injectCompletedStorageCheckpointContext(enrichedInput: string, audit: AuroraStorageAudit): string {
  const lines = enrichedInput.split("\n");
  if (!lines.some((line) => line.trim() === COGNITIVE_CONTEXT_CLOSE)) {
    return enrichedInput;
  }
  const rewritten: string[] = [];
  const targets = storageTargetsText(audit.targets);
  for (const line of lines) {
    if (
      line.startsWith("owner_turn_reminder=") ||
      line.startsWith("owner_turn_reminder_rule=") ||
      line.startsWith("storage_audit_")
    ) {
      continue;
    }
    if (line.trim() === COGNITIVE_CONTEXT_CLOSE) {
      rewritten.push("storage_checkpoint_status=completed");
      rewritten.push(`storage_checkpoint_result=decision:${audit.decision}; targets:${targets}`);
      rewritten.push(
        "storage_checkpoint_rule=Pre-reply storage classification and any required storage actions for this turn are already complete. Answer naturally and do not repeat storage work unless correcting a real mistake."
      );
    }
    rewritten.push(line);
  }
  return rewritten.join("\n");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runGatewayCall(method: string, params: Record<string, unknown>): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(
      "openclaw",
      ["gateway", "call", method, "--json", "--params", JSON.stringify(params)],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: OPENCLAW_CALL_TIMEOUT_MS
      }
    );
    return JSON.parse(stdout);
  } catch (error) {
    const details =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "").trim()
        : "";
    const message = error instanceof Error ? error.message : "OpenClaw gateway call failed.";
    throw new Error(details || message);
  }
}

async function readChatHistory(sessionKey: string): Promise<OpenClawHistoryResponse | null> {
  try {
    return (await runGatewayCall("chat.history", { sessionKey })) as OpenClawHistoryResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("session not found")) {
      return null;
    }
    throw error;
  }
}

function extractNewAssistantMessage(
  history: OpenClawHistoryResponse | null,
  baselineCount: number,
  baselineSeq: number
): OpenClawHistoryMessage | null {
  const messages = historyMessageArray(history);

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message?.role ?? "").trim().toLowerCase() !== "assistant") {
      continue;
    }

    const seq = toFiniteNumber(message?.__openclaw?.seq);
    if ((seq !== null && seq > baselineSeq) || index >= baselineCount) {
      return message;
    }
  }

  return null;
}

async function waitForAssistantReply(
  sessionKey: string,
  baselineCount: number,
  baselineSeq: number
): Promise<{
  history: OpenClawHistoryResponse;
  message: OpenClawHistoryMessage;
}> {
  const deadline = Date.now() + OPENCLAW_HISTORY_WAIT_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const history = await readChatHistory(sessionKey);
    const message = extractNewAssistantMessage(history, baselineCount, baselineSeq);
    if (history && message && extractAssistantText(message) && !messageHasToolCalls(message)) {
      return { history, message };
    }

    await sleep(OPENCLAW_HISTORY_POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for OpenClaw assistant reply.");
}

async function runOwnerStorageCheckpoint(params: {
  sessionKey: string;
  enrichedInput: string;
}): Promise<{
  audit: AuroraStorageAudit;
}> {
  const checkpointSessionKey = buildOwnerStorageCheckpointSessionKey(params.sessionKey);
  let baselineCount = 0;
  let baselineSeq = 0;
  let prompt = buildOwnerStorageCheckpointPrompt(params.enrichedInput);
  let lastReason = "Hidden storage checkpoint did not complete.";

  for (let attempt = 0; attempt < OWNER_STORAGE_CHECKPOINT_MAX_ATTEMPTS; attempt += 1) {
    await runGatewayCall("chat.send", {
      sessionKey: checkpointSessionKey,
      message: prompt,
      idempotencyKey: randomUUID()
    });

    const { history, message } = await waitForAssistantReply(checkpointSessionKey, baselineCount, baselineSeq);
    const checkpointMessages = newHistoryMessages(history, 0);
    const parsed = parseAuroraStorageAuditOutput(extractAssistantText(message));
    const validation = validateOwnerStorageCheckpoint(checkpointMessages, parsed.audit);
    if (validation.ok) {
      return {
        audit: validation.audit
      };
    }

    lastReason = validation.reason;
    baselineCount = historyMessageArray(history).length;
    baselineSeq = baselineAssistantSeq(historyMessageArray(history));
    prompt = buildOwnerStorageCheckpointCorrectionPrompt(validation.reason);
  }

  throw new Error(lastReason);
}

async function readStdin(): Promise<string> {
  if (process.stdin.destroyed) {
    return "";
  }
  return await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", (error) => {
      reject(error);
    });
  });
}

function emitJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function handleOverlay(raw: string): Promise<void> {
  const payload = JSON.parse(raw || "{}") as OverlayRequest;
  const userText = asString(payload.userText);
  if (!userText) {
    emitJson({ ok: true, contextBlock: "", reason: "empty_user_text" });
    return;
  }

  const sessionId = resolveSessionId(payload);
  const preflight = await prepareSendContext({
    userText,
    sessionId: sessionId || undefined,
    partnerId: asString(payload.partnerId) || undefined,
    speakerName: asString(payload.speakerName) || undefined
  });

  let enrichedInput = preflight.enrichedInput;
  let enforcedStorageAudit: AuroraStorageAudit | null = null;
  const skipOwnerStorageCheckpoint =
    SKIP_OWNER_STORAGE_CHECKPOINT || asBoolean(payload.skipOwnerStorageCheckpoint) === true;
  if (
    OWNER_STORAGE_CHECKPOINT_ENABLED &&
    preflight.ownerStorageCheckpointRequired === true &&
    sessionId &&
    !skipOwnerStorageCheckpoint
  ) {
    const checkpoint = await runOwnerStorageCheckpoint({
      sessionKey: sessionId,
      enrichedInput
    });
    enforcedStorageAudit = checkpoint.audit;
    enrichedInput = injectCompletedStorageCheckpointContext(enrichedInput, checkpoint.audit);
  }

  const contextBlock = extractContextBlock(enrichedInput);
  emitJson({
    ok: true,
    contextBlock,
    sessionId,
    complianceId: preflight.complianceId,
    gate: preflight.gate,
    gateReason: preflight.gateReason,
    contextHash: contextBlock ? hashText(contextBlock) : "",
    ownerStorageCheckpointRequired:
      OWNER_STORAGE_CHECKPOINT_ENABLED && preflight.ownerStorageCheckpointRequired === true,
    storageAudit:
      enforcedStorageAudit
        ? {
            decision: enforcedStorageAudit.decision,
            lookupRequired: enforcedStorageAudit.lookupRequired,
            targets: enforcedStorageAudit.targets,
            status: "checkpoint_enforced"
          }
        : null
  });
}

async function handleRecord(raw: string): Promise<void> {
  const payload = JSON.parse(raw || "{}") as RecordRequest;
  const userText = asString(payload.userText);
  const rawAuroraText = asString(payload.rawAuroraText) || asString(payload.auroraText);
  const complianceId = asString(payload.complianceId);
  const { audit, status, visibleText } = resolveStorageAudit(payload, rawAuroraText);
  const auroraText = visibleText;
  if (!userText || !auroraText) {
    emitJson({ ok: true, recorded: false, reason: "missing_turn_text" });
    return;
  }

  const sessionId = resolveSessionId(payload);
  const rawSource = asString(payload.source) || undefined;
  const sourceNormalization = normalizeConversationEventIngress({
    type: "conversation_turn",
    rawSource,
    trigger: asString(payload.trigger) || undefined,
    userText,
    auroraText
  });
  const snapshot = await recordConversationEvent({
    type: "conversation_turn",
    source: sourceNormalization.source,
    rawSource: sourceNormalization.rawSource ?? undefined,
    trigger: asString(payload.trigger) || undefined,
    userText,
    auroraText,
    sessionId: sessionId || undefined,
    partnerId: asString(payload.partnerId) || undefined,
    speakerName: asString(payload.speakerName) || undefined,
    responseId: asString(payload.responseId) || undefined
  });

  if (complianceId) {
    await recordDispatchOutcome({
      complianceId,
      stage: "post_response",
      httpStatus: 200,
      responseId: asString(payload.responseId) || undefined,
      ...(audit || status
        ? {
            storageAudit: {
              ...(audit
                ? {
                    decision: audit.decision,
                    lookupRequired: audit.lookupRequired,
                    targets: audit.targets
                  }
                : {}),
              ...(status ? { status } : {})
            }
          }
        : {})
    });
  }

  emitJson({
    ok: true,
    recorded: true,
    sessionId,
    complianceId,
    storageAudit:
      audit || status
        ? {
            ...(audit
              ? {
                  decision: audit.decision,
                  lookupRequired: audit.lookupRequired,
                  targets: audit.targets
                }
              : {}),
            ...(status ? { status } : {})
          }
        : null,
    emotion: snapshot.emotion?.label ?? "",
    emotionHash: hashText(`${userText}\n${auroraText}`)
  });
}

async function main(): Promise<void> {
  const mode = process.argv[2]?.trim().toLowerCase();
  const raw = await readStdin();

  if (mode === "overlay") {
    await handleOverlay(raw);
    return;
  }

  if (mode === "record") {
    await handleRecord(raw);
    return;
  }

  throw new Error(`Unsupported mode: ${mode || "<empty>"}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
