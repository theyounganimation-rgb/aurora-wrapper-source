export const AURORA_STORAGE_AUDIT_DECISIONS = [
  "none",
  "belief",
  "trait",
  "preference",
  "capability",
  "promise",
  "USER.md",
  "MEMORY.md",
  "today_log",
  "revision"
] as const;

export type AuroraStorageAuditDecision = (typeof AURORA_STORAGE_AUDIT_DECISIONS)[number];

export const AURORA_STORAGE_AUDIT_TARGETS = [
  "none",
  "beliefs.json",
  "traits.json",
  "preferences.json",
  "capabilities.json",
  "promises.json",
  "USER.md",
  "MEMORY.md",
  "today_log"
] as const;

export type AuroraStorageAuditTarget = (typeof AURORA_STORAGE_AUDIT_TARGETS)[number];

export interface AuroraStorageAudit {
  decision: AuroraStorageAuditDecision;
  lookupRequired: boolean;
  targets: AuroraStorageAuditTarget[];
  rawHeader: string;
}

export interface ParsedAuroraStorageAuditOutput {
  audit: AuroraStorageAudit | null;
  visibleText: string;
  hadHeader: boolean;
  malformedHeader: boolean;
}

export const AURORA_STORAGE_AUDIT_HEADER_PREFIX = "[AURORA_STORAGE_AUDIT";
export const AURORA_STORAGE_AUDIT_DECISION_LIST = AURORA_STORAGE_AUDIT_DECISIONS.join("|");
export const AURORA_STORAGE_AUDIT_TARGET_LIST = AURORA_STORAGE_AUDIT_TARGETS.join("|");
export const AURORA_STORAGE_AUDIT_HEADER_EXAMPLE =
  "[AURORA_STORAGE_AUDIT decision=belief lookup_required=false targets=beliefs.json,today_log]";

function stripLeadingReplyRoutingMarkers(text: string): string {
  let current = typeof text === "string" ? text : "";
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(/^\s*\[\[\s*(?:reply_to_current|reply_to\s*:\s*[^\]\n]+)\s*\]\]\s*/i, "");
  }
  return current;
}

function canonicalStorageAuditDecision(raw: string): AuroraStorageAuditDecision | null {
  const normalized = raw.trim().toLowerCase();
  for (const decision of AURORA_STORAGE_AUDIT_DECISIONS) {
    if (decision.toLowerCase() === normalized) {
      return decision;
    }
  }
  return null;
}

function canonicalStorageAuditTarget(raw: string): AuroraStorageAuditTarget | null {
  const normalized = raw.trim().toLowerCase();
  for (const target of AURORA_STORAGE_AUDIT_TARGETS) {
    if (target.toLowerCase() === normalized) {
      return target;
    }
  }
  return null;
}

function parseStorageAuditTargets(raw: string | undefined): AuroraStorageAuditTarget[] | null {
  if (!raw) {
    return [];
  }
  const tokens = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }
  const parsed: AuroraStorageAuditTarget[] = [];
  for (const token of tokens) {
    const canonical = canonicalStorageAuditTarget(token);
    if (!canonical) {
      return null;
    }
    if (!parsed.includes(canonical)) {
      parsed.push(canonical);
    }
  }
  return parsed;
}

export function parseAuroraStorageAuditOutput(text: string): ParsedAuroraStorageAuditOutput {
  const source = typeof text === "string" ? text : "";
  const trimmedStart = stripLeadingReplyRoutingMarkers(source).trimStart();
  if (!trimmedStart.startsWith(AURORA_STORAGE_AUDIT_HEADER_PREFIX)) {
    return {
      audit: null,
      visibleText: stripLeadingReplyRoutingMarkers(source).trim(),
      hadHeader: false,
      malformedHeader: false
    };
  }

  const headerCloseIndex = trimmedStart.indexOf("]");
  if (headerCloseIndex === -1) {
    return {
      audit: null,
      visibleText: source.trim(),
      hadHeader: true,
      malformedHeader: true
    };
  }

  const rawHeader = trimmedStart.slice(0, headerCloseIndex + 1);
  const body = stripLeadingReplyRoutingMarkers(trimmedStart.slice(headerCloseIndex + 1)).trimStart();
  const match = rawHeader.match(
    /^\[AURORA_STORAGE_AUDIT\s+decision=([^\]\s]+)\s+lookup_required=(true|false)(?:\s+targets=([^\]\s]+))?\s*\]$/i
  );
  const decision = match?.[1] ? canonicalStorageAuditDecision(match[1]) : null;
  const lookupRequired = match?.[2]?.toLowerCase() === "true";
  const targets = parseStorageAuditTargets(match?.[3]);

  return {
    audit:
      decision && targets
        ? {
            decision,
            lookupRequired,
            targets,
            rawHeader
          }
        : null,
    visibleText: body.trim(),
    hadHeader: true,
    malformedHeader: !decision || !match || !targets
  };
}
