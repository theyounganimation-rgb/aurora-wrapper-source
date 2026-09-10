import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCognitiveSnapshotReadOnly } from "@/lib/auroraCognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CONTEXT_PATH = path.join(process.cwd(), ".aurora", "aurora-context.json");
const DEFAULT_MEMORY_PATH = path.join(process.cwd(), ".aurora", "autobiographical-memory.json");
const MAX_PREVIEW_CHARS = 3600;

type FileGroup = "state" | "runtime" | "logs";

interface InternalFileDescriptor {
  id: string;
  title: string;
  group: FileGroup;
  kind: "json" | "log" | "text";
  path: string;
  preferTail?: boolean;
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function excerptText(source: string, preferTail = false): { preview: string; truncated: boolean } {
  if (source.length <= MAX_PREVIEW_CHARS) {
    return {
      preview: source,
      truncated: false
    };
  }

  if (preferTail) {
    return {
      preview: `…\n${source.slice(-MAX_PREVIEW_CHARS)}`,
      truncated: true
    };
  }

  return {
    preview: `${source.slice(0, MAX_PREVIEW_CHARS)}\n…`,
    truncated: true
  };
}

async function readSnapshot(descriptor: InternalFileDescriptor) {
  try {
    const [fileStat, rawContent] = await Promise.all([
      stat(descriptor.path),
      readFile(descriptor.path, "utf8")
    ]);
    const excerpt = excerptText(rawContent, descriptor.preferTail === true);

    return {
      id: descriptor.id,
      title: descriptor.title,
      group: descriptor.group,
      kind: descriptor.kind,
      path: descriptor.path,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      preview: excerpt.preview,
      truncated: excerpt.truncated
    };
  } catch (error) {
    return {
      id: descriptor.id,
      title: descriptor.title,
      group: descriptor.group,
      kind: descriptor.kind,
      path: descriptor.path,
      sizeBytes: 0,
      modifiedAt: null,
      preview: "",
      truncated: false,
      error: error instanceof Error ? error.message : "Unable to read file."
    };
  }
}

function uniqueDescriptors(descriptors: InternalFileDescriptor[]): InternalFileDescriptor[] {
  const seen = new Set<string>();
  const deduped: InternalFileDescriptor[] = [];

  for (const descriptor of descriptors) {
    const normalizedPath = descriptor.path.trim();
    if (!normalizedPath || seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    deduped.push({
      ...descriptor,
      path: normalizedPath
    });
  }

  return deduped;
}

async function resolveContextFilePath(candidates: string[]): Promise<string> {
  const paths = uniquePaths(candidates);

  for (const candidate of paths) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return paths[0] || "";
}

export async function GET() {
  const configuredSourcePath = process.env.AURORA_CONTEXT_PATH || DEFAULT_CONTEXT_PATH;
  const configuredMemoryPath = process.env.AURORA_MEMORY_PATH || DEFAULT_MEMORY_PATH;
  const cognition = await getCognitiveSnapshotReadOnly().catch(() => null);
  const sourcePath = await resolveContextFilePath([
    configuredSourcePath,
    configuredMemoryPath,
    cognition?.runtimePath || ""
  ]);

  const descriptorCandidates: InternalFileDescriptor[] = [
      {
        id: "aurora-context",
        title: "Aurora Context",
        group: "state",
        kind: "json",
        path: sourcePath
      },
      {
        id: "runtime-state",
        title: "Runtime Snapshot",
        group: "runtime",
        kind: "json",
        path: cognition?.runtimePath || ""
      },
      {
        id: "event-log",
        title: "Event Log",
        group: "logs",
        kind: "log",
        path: cognition?.eventLogPath || "",
        preferTail: true
      },
      {
        id: "compliance-log",
        title: "Compliance Log",
        group: "logs",
        kind: "log",
        path: cognition?.complianceLogPath || "",
        preferTail: true
      }
  ];

  const descriptors = uniqueDescriptors(
    descriptorCandidates.filter((descriptor) => descriptor.path.trim().length > 0)
  );

  const files = await Promise.all(descriptors.map(readSnapshot));

  return NextResponse.json(
    {
      files
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
