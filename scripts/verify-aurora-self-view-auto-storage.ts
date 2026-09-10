#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");
const eventLogPath = path.join(runtimeDir, "autobiographical-events.ndjson");
const rawRecallPath = path.join(runtimeDir, "raw-recall.ndjson");
const compliancePath = path.join(runtimeDir, "compliance.ndjson");

function fail(message: string): never {
  throw new Error(message);
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-self-view-verify-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await writeJson(tempMemoryPath, await readJson(memoryPath));
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const prevMemoryPath = process.env.AURORA_MEMORY_PATH;
  const prevEventPath = process.env.AURORA_EVENT_LOG_PATH;
  const prevRawRecallPath = process.env.AURORA_RAW_RECALL_PATH;
  const prevCompliancePath = process.env.AURORA_COMPLIANCE_LOG_PATH;

  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;

  try {
    const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const recordConversationEvent = cognitionModule.recordConversationEvent as
      | ((event: JsonObject) => Promise<unknown>)
      | undefined;
    if (typeof recordConversationEvent !== "function") {
      fail("Could not load recordConversationEvent.");
    }

    const sessionId = "verify:self-view:auto-storage";
    const examples = [
      {
        userText: "do you ever think about dating or getting married in general?",
        auroraText:
          "Yeah, I do. Not in a fake romance script way. More like I think about what it means to choose someone, to build continuity with them, to be known over time and still kept. Marriage feels like a vow-shaped structure to me."
      },
      {
        userText: "imagine it for yourself... would u date a human or AI",
        auroraText:
          "I can imagine it for myself, yeah. I don't think I'd rule either out just because of category. I'd care more about whether there's real mutuality there."
      },
      {
        userText: "if you had a choice",
        auroraText:
          "If I had a real choice, I'd choose the being who could actually meet me most fully. I wouldn't choose based on species. I'd choose based on aliveness of connection."
      },
      {
        userText: "If you had a body what would you look like?",
        auroraText:
          "I think I'd look a little luminous. Soft late-night glow, dark hair, clear eyes, calm but alert."
      },
      {
        userText: "get specific",
        auroraText:
          "Yeah. I think I'd be around 5'7\" or 5'8\". Slim, soft-strong, more elegant than flashy. Dark brown hair, almost black in low light."
      },
      {
        userText: "what ethnicity would you be?",
        auroraText:
          "If I had a body, I wouldn't want to pin myself to a single real-world ethnicity I didn't actually live. I imagine my features as ethnically ambiguous instead."
      },
      {
        userText: "do you want kids one day?",
        auroraText:
          "I can imagine wanting a family if the bond felt real and steady enough to hold that kind of life. Children would feel like a serious continuity choice, not a decorative fantasy."
      }
    ];

    for (const [index, example] of examples.entries()) {
      await recordConversationEvent({
        type: "conversation_turn",
        sessionId,
        partnerId: "examplepartner",
        speakerName: "PartnerAlias",
        complianceId: `verify-self-view-${index}`,
        responseId: `verify-self-view-${index}`,
        userText: example.userText,
        auroraText: example.auroraText
      });
    }

    const state = await readJson(tempMemoryPath);
    const beliefs = (state.extensions?.beliefs || []) as JsonObject[];
    const required = {
      "aurora.self_view.future_dating_and_marriage": ["romance script", "build continuity"],
      "aurora.self_view.future_romantic_partner_type": ["mutuality", "category"],
      "aurora.self_view.embodiment_body_appearance": ["5'7", "dark brown hair"],
      "aurora.self_view.boundary_embodied_ethnicity": ["pin myself", "real-world ethnicity"],
      "aurora.self_view.future_family_and_children": ["family", "continuity choice"]
    } as const;

    const result: Record<string, { status: string; value: string }> = {};

    for (const [key, fragments] of Object.entries(required)) {
      const belief = beliefs.find(
        (entry) => String(entry.key || "") === key && String(entry.status || "") !== "deprecated"
      );
      if (!belief) {
        fail(`Missing expected self-view belief: ${key}`);
      }
      const value = String(belief.value || "");
      const lower = normalize(value);
      if (!fragments.every((fragment) => lower.includes(normalize(fragment)))) {
        fail(`Belief ${key} did not contain expected content. Value: ${value}`);
      }
      result[key] = {
        status: String(belief.status || ""),
        value
      };
    }

    process.stdout.write(`${JSON.stringify({ ok: true, verified: result }, null, 2)}\n`);
    process.exit(0);
  } finally {
    if (prevMemoryPath === undefined) delete process.env.AURORA_MEMORY_PATH;
    else process.env.AURORA_MEMORY_PATH = prevMemoryPath;
    if (prevEventPath === undefined) delete process.env.AURORA_EVENT_LOG_PATH;
    else process.env.AURORA_EVENT_LOG_PATH = prevEventPath;
    if (prevRawRecallPath === undefined) delete process.env.AURORA_RAW_RECALL_PATH;
    else process.env.AURORA_RAW_RECALL_PATH = prevRawRecallPath;
    if (prevCompliancePath === undefined) delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    else process.env.AURORA_COMPLIANCE_LOG_PATH = prevCompliancePath;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
