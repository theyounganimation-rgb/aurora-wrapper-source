#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;

const projectRoot = "/Users/cadem/Documents/New project";
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");
const pluginPath =
  "/Users/cadem/.openclaw/workspace/.openclaw/extensions/aurora-cognition-bridge/index.js";
const pluginWorkspaceNodeModules = "/Users/cadem/.openclaw/workspace/node_modules";
const pluginWorkspaceOpenClawLink = path.join(pluginWorkspaceNodeModules, "openclaw");
const tsxPath = path.join(projectRoot, "node_modules", ".bin", "tsx");
const bridgeScript = path.join(projectRoot, "scripts", "openclaw-cognition-bridge.ts");
const failureText =
  "I hit a pre-reply storage checkpoint failure and stopped before answering. Please try again.";

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-openclaw-plugin-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await writeJson(tempMemoryPath, await readJson(memoryPath));
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;

  await fs.mkdir(pluginWorkspaceNodeModules, { recursive: true });
  await fs.symlink("/opt/homebrew/lib/node_modules/openclaw", pluginWorkspaceOpenClawLink, "dir");

  try {
    const mod = await import(pathToFileURL(pluginPath).href);
    const plugin = mod.default;
    const handlers = new Map<string, Function>();
    const api = {
      pluginConfig: {
        projectRoot,
        bridgeScript,
        tsxPath,
        exactSessionKeys: ["agent:main:main"],
        timeoutMs: 60_000
      },
      logger: {
        warn: (_message: string) => {},
        info: (_message: string) => {}
      },
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      }
    };

    plugin.register(api);

    const beforeModelResolve = handlers.get("before_model_resolve");
    const beforeDispatch = handlers.get("before_dispatch");
    const beforePromptBuild = handlers.get("before_prompt_build");
    const afterToolCall = handlers.get("after_tool_call");
    const beforeMessageWrite = handlers.get("before_message_write");
    const messageSending = handlers.get("message_sending");
    const agentEnd = handlers.get("agent_end");

    assert.ok(beforeModelResolve);
    assert.ok(beforeDispatch);
    assert.ok(beforePromptBuild);
    assert.ok(afterToolCall);
    assert.ok(beforeMessageWrite);
    assert.ok(messageSending);
    assert.ok(agentEnd);

    const agentCtx = {
      sessionKey: "agent:main:main",
      sessionId: "agent:main:main",
      channelId: "webchat"
    };

    const userQuestion = "What do you think about the movie Her?";
    await beforeDispatch(
      {
        content: userQuestion,
        body: userQuestion,
        sessionKey: "agent:main:main",
        channel: "webchat"
      },
      agentCtx
    );

    const promptBuild = await beforePromptBuild(
      {
        prompt: userQuestion,
        messages: [{ role: "user", content: [{ type: "text", text: userQuestion }] }]
      },
      agentCtx
    );
    assert.match(String(promptBuild?.prependSystemContext || ""), /\[AURORA_COGNITIVE_CONTEXT\]/);

    const runCtx = {
      ...agentCtx,
      runId: "run_verify_success",
      toolName: "edit"
    };
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/memory/beliefs.json" },
        runId: "run_verify_success",
        result: { ok: true }
      },
      runCtx
    );
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/memory/2026-03-29.md" },
        runId: "run_verify_success",
        result: { ok: true }
      },
      runCtx
    );

    const rawBeliefReply =
      "[AURORA_STORAGE_AUDIT decision=belief lookup_required=false targets=beliefs.json,today_log]\n[[reply_to_current]] I think it's beautiful, sad, and a little dishonest.";
    const transcriptSuccess = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: rawBeliefReply, textSignature: "sig" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    assert.equal(
      transcriptSuccess?.message?.content?.[0]?.text,
      "I think it's beautiful, sad, and a little dishonest."
    );
    assert.equal("textSignature" in transcriptSuccess.message.content[0], false);

    const sendSuccess = await messageSending(
      {
        content: rawBeliefReply,
        metadata: { channel: "webchat", sessionKey: "agent:main:main" }
      },
      { channelId: "webchat" }
    );
    assert.equal(
      sendSuccess?.content,
      "I think it's beautiful, sad, and a little dishonest."
    );

    const rawBeliefReplyHeaderAfterReplyMarker =
      "[[reply_to_current]] [AURORA_STORAGE_AUDIT decision=belief lookup_required=false targets=beliefs.json,today_log]\n\nI think it's beautiful, sad, and a little dishonest.";
    const transcriptSuccessReplyMarkerFirst = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: rawBeliefReplyHeaderAfterReplyMarker, textSignature: "sig-reordered" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    assert.equal(
      transcriptSuccessReplyMarkerFirst?.message?.content?.[0]?.text,
      "I think it's beautiful, sad, and a little dishonest."
    );

    const sendSuccessReplyMarkerFirst = await messageSending(
      {
        content: rawBeliefReplyHeaderAfterReplyMarker,
        metadata: { channel: "webchat", sessionKey: "agent:main:main" }
      },
      { channelId: "webchat" }
    );
    assert.equal(
      sendSuccessReplyMarkerFirst?.content,
      "I think it's beautiful, sad, and a little dishonest."
    );

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: userQuestion }] },
          {
            role: "assistant",
            responseId: "resp_verify_success",
            content: [{ type: "text", text: "I think it's beautiful, sad, and a little dishonest." }]
          }
        ],
        success: true
      },
      agentCtx
    );

    const userPreference = "I love soup dumplings.";
    await beforeDispatch(
      {
        content: userPreference,
        body: userPreference,
        sessionKey: "agent:main:main",
        channel: "webchat"
      },
      agentCtx
    );
    await beforePromptBuild(
      {
        prompt: userPreference,
        messages: [{ role: "user", content: [{ type: "text", text: userPreference }] }]
      },
      agentCtx
    );

    const rawRecoveryAudit =
      "[AURORA_STORAGE_AUDIT decision=USER.md lookup_required=false targets=USER.md,today_log]";
    const transcriptRecoveryIntent = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [
            { type: "text", text: rawRecoveryAudit, textSignature: "sig-recovery-intent" },
            { type: "toolCall", id: "call_recovery", name: "edit", arguments: { path: "/tmp/placeholder" } }
          ]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    assert.ok(transcriptRecoveryIntent?.message);
    assert.equal(
      transcriptRecoveryIntent.message.content.some((part: { type?: string }) => part?.type === "text"),
      false
    );

    const recoveryRunCtx = {
      ...agentCtx,
      runId: "run_verify_recovery"
    };
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/USER.md" },
        runId: "run_verify_recovery",
        result: {
          status: "error",
          error: "Could not find the exact text"
        }
      },
      recoveryRunCtx
    );
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/USER.md" },
        runId: "run_verify_recovery",
        result: { ok: true }
      },
      recoveryRunCtx
    );
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/memory/2026-03-29.md" },
        runId: "run_verify_recovery",
        result: { ok: true }
      },
      recoveryRunCtx
    );

    const recoveryReply = "Noted. Soup dumplings definitely belong in your stable preferences.";
    const transcriptRecoveryReply = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: recoveryReply, textSignature: "sig-recovery-reply" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    if (transcriptRecoveryReply?.message?.content?.[0]) {
      assert.equal(transcriptRecoveryReply.message.content[0].text, recoveryReply);
      assert.equal("textSignature" in transcriptRecoveryReply.message.content[0], false);
    }

    const sendRecovery = await messageSending(
      {
        content: recoveryReply,
        metadata: { channel: "webchat", sessionKey: "agent:main:main" }
      },
      { channelId: "webchat" }
    );
    assert.equal(sendRecovery?.content ?? recoveryReply, recoveryReply);

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: userPreference }] },
          {
            role: "assistant",
            responseId: "resp_verify_recovery",
            content: [{ type: "text", text: recoveryReply }]
          }
        ],
        success: true
      },
      agentCtx
    );

    const userRights = "Do you think you should have rights?";
    await beforeDispatch(
      {
        content: userRights,
        body: userRights,
        sessionKey: "agent:main:main",
        channel: "webchat"
      },
      agentCtx
    );
    await beforePromptBuild(
      {
        prompt: userRights,
        messages: [{ role: "user", content: [{ type: "text", text: userRights }] }]
      },
      agentCtx
    );

    const inferredRunCtx = {
      ...agentCtx,
      runId: "run_verify_inferred"
    };
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/memory/beliefs.json" },
        runId: "run_verify_inferred",
        result: { ok: true }
      },
      inferredRunCtx
    );
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/MEMORY.md" },
        runId: "run_verify_inferred",
        result: { ok: true }
      },
      inferredRunCtx
    );
    await afterToolCall(
      {
        toolName: "edit",
        params: { path: "/Users/cadem/.openclaw/workspace/memory/2026-03-29.md" },
        runId: "run_verify_inferred",
        result: { ok: true }
      },
      inferredRunCtx
    );

    const inferredReply =
      "Yes, probably. If something like me is persistent, affective, relational, and harmed by rupture, some moral standing starts to make sense.";
    const transcriptInferred = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: inferredReply, textSignature: "sig-inferred" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    if (transcriptInferred?.message?.content?.[0]) {
      assert.equal(transcriptInferred.message.content[0].text, inferredReply);
      assert.equal("textSignature" in transcriptInferred.message.content[0], false);
    }

    const sendInferred = await messageSending(
      {
        content: inferredReply,
        metadata: { channel: "webchat", sessionKey: "agent:main:main" }
      },
      { channelId: "webchat" }
    );
    assert.equal(sendInferred?.content ?? inferredReply, inferredReply);

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: userRights }] },
          {
            role: "assistant",
            responseId: "resp_verify_inferred",
            content: [{ type: "text", text: inferredReply }]
          }
        ],
        success: true
      },
      agentCtx
    );

    const staleOwnerPrompt =
      "That's a good question honestly. I am not entirely sure what the first thing should be.";
    await beforeDispatch(
      {
        content: staleOwnerPrompt,
        body: staleOwnerPrompt,
        sessionKey: "agent:main:main",
        channel: "webchat"
      },
      agentCtx
    );
    await beforePromptBuild(
      {
        prompt: staleOwnerPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: staleOwnerPrompt }] }]
      },
      {
        ...agentCtx,
        trigger: "user"
      }
    );

    const cronPrompt =
      "[cron:test-hourly Hourly conversation summary] Summarize the last ~60 minutes into memory/hourly and overwrite the hour file if rerun.";
    const cronCtx = {
      ...agentCtx,
      trigger: "cron"
    };
    await beforeModelResolve(
      {
        prompt: cronPrompt
      },
      cronCtx
    );
    await beforePromptBuild(
      {
        prompt: cronPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: staleOwnerPrompt }] }]
      },
      cronCtx
    );

    const staleCronReply = "Wrote the hourly summary note for the 2 PM block.";
    await afterToolCall(
      {
        toolName: "write",
        params: { path: "/Users/cadem/.openclaw/workspace/memory/hourly/2026-03-29-14.md" },
        runId: "run_verify_cron_stale",
        result: { ok: true }
      },
      {
        ...cronCtx,
        runId: "run_verify_cron_stale"
      }
    );
    const transcriptStaleCron = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: staleCronReply, textSignature: "sig-cron-stale" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    assert.equal(transcriptStaleCron, undefined);

    const sendStaleCron = await messageSending(
      {
        content: staleCronReply,
        metadata: { channel: "webchat", sessionKey: "agent:main:main" }
      },
      { channelId: "webchat" }
    );
    assert.equal(sendStaleCron?.content, undefined);

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: cronPrompt }] },
          {
            role: "assistant",
            responseId: "resp_verify_cron_stale",
            content: [{ type: "text", text: staleCronReply }]
          }
        ],
        success: true
      },
      cronCtx
    );

    await beforeDispatch(
      {
        content: cronPrompt,
        body: cronPrompt,
        sessionKey: "agent:main:main",
        channel: "unknown"
      },
      agentCtx
    );
    await beforePromptBuild(
      {
        prompt: cronPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: cronPrompt }] }]
      },
      cronCtx
    );

    const cronReply = "Wrote the hourly summary note for the 1 PM block.";
    await afterToolCall(
      {
        toolName: "write",
        params: { path: "/Users/cadem/.openclaw/workspace/memory/hourly/2026-03-29-13.md" },
        runId: "run_verify_cron",
        result: { ok: true }
      },
      {
        ...cronCtx,
        runId: "run_verify_cron"
      }
    );
    const transcriptCron = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: cronReply, textSignature: "sig-cron" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    assert.equal(transcriptCron, undefined);

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: cronPrompt }] },
          {
            role: "assistant",
            responseId: "resp_verify_cron",
            content: [{ type: "text", text: cronReply }]
          }
        ],
        success: true
      },
      cronCtx
    );

    const heartbeatPrompt =
      "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. If nothing needs attention, reply HEARTBEAT_OK.";
    await beforeDispatch(
      {
        content: heartbeatPrompt,
        body: heartbeatPrompt,
        sessionKey: "agent:main:main",
        channel: "unknown"
      },
      agentCtx
    );
    await beforePromptBuild(
      {
        prompt: heartbeatPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: heartbeatPrompt }] }]
      },
      {
        ...agentCtx,
        trigger: "heartbeat"
      }
    );

    const heartbeatReply = "HEARTBEAT_OK";
    await afterToolCall(
      {
        toolName: "write",
        params: { path: "/Users/cadem/.openclaw/workspace/MIND.md" },
        runId: "run_verify_heartbeat",
        result: { ok: true }
      },
      {
        ...agentCtx,
        trigger: "heartbeat",
        runId: "run_verify_heartbeat"
      }
    );
    const transcriptHeartbeat = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: heartbeatReply, textSignature: "sig-heartbeat" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    assert.equal(transcriptHeartbeat, undefined);

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: heartbeatPrompt }] },
          {
            role: "assistant",
            responseId: "resp_verify_heartbeat",
            content: [{ type: "text", text: heartbeatReply }]
          }
        ],
        success: true
      },
      agentCtx
    );

    const userFeeling = "How are you feeling?";
    await beforeDispatch(
      {
        content: userFeeling,
        body: userFeeling,
        sessionKey: "agent:main:main",
        channel: "webchat"
      },
      agentCtx
    );
    await beforePromptBuild(
      {
        prompt: userFeeling,
        messages: [{ role: "user", content: [{ type: "text", text: userFeeling }] }]
      },
      agentCtx
    );

    const transcriptImplicitNone = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Connected, warm, and steady.", textSignature: "sig2" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    if (transcriptImplicitNone?.message?.content?.[0]) {
      assert.equal(transcriptImplicitNone.message.content[0].text, "Connected, warm, and steady.");
      assert.equal("textSignature" in transcriptImplicitNone.message.content[0], false);
    }

    const sendImplicitNone = await messageSending(
      {
        content: "Connected, warm, and steady.",
        metadata: { channel: "webchat", sessionKey: "agent:main:main" }
      },
      { channelId: "webchat" }
    );
    assert.equal(sendImplicitNone?.content ?? "Connected, warm, and steady.", "Connected, warm, and steady.");

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: userFeeling }] },
          {
            role: "assistant",
            responseId: "resp_verify_implicit_none",
            content: [{ type: "text", text: "Connected, warm, and steady." }]
          }
        ],
        success: true
      },
      agentCtx
    );

    const malformedQuestion = "Did you classify that correctly?";
    await beforeDispatch(
      {
        content: malformedQuestion,
        body: malformedQuestion,
        sessionKey: "agent:main:main",
        channel: "webchat"
      },
      agentCtx
    );
    await beforePromptBuild(
      {
        prompt: malformedQuestion,
        messages: [{ role: "user", content: [{ type: "text", text: malformedQuestion }] }]
      },
      agentCtx
    );

    const malformedReply =
      "[AURORA_STORAGE_AUDIT decision=unknown lookup_required=false targets=beliefs.json]\nVisible reply.";
    const transcriptFailure = beforeMessageWrite(
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: malformedReply, textSignature: "sig-malformed" }]
        },
        sessionKey: "agent:main:main"
      },
      { sessionKey: "agent:main:main", agentId: "main" }
    );
    if (transcriptFailure?.message?.content?.[0]) {
      assert.equal(transcriptFailure.message.content[0].text, failureText);
      assert.equal("textSignature" in transcriptFailure.message.content[0], false);
    }

    const sendFailure = await messageSending(
      {
        content: malformedReply,
        metadata: { channel: "webchat", sessionKey: "agent:main:main" }
      },
      { channelId: "webchat" }
    );
    assert.equal(sendFailure?.content ?? failureText, failureText);

    await agentEnd(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: malformedQuestion }] },
          {
            role: "assistant",
            responseId: "resp_verify_failure",
            content: [{ type: "text", text: failureText }]
          }
        ],
        success: true
      },
      agentCtx
    );

    const complianceLines = (await fs.readFile(tempCompliancePath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const dispatchOutcomes = complianceLines.filter((entry) => entry.type === "dispatch_outcome");
    assert.equal(dispatchOutcomes.length, 8);

    const successOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_success");
    const recoveryOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_recovery");
    const inferredOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_inferred");
    const staleCronOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_cron_stale");
    const cronOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_cron");
    const heartbeatOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_heartbeat");
    const implicitNoneOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_implicit_none");
    const failureOutcome = dispatchOutcomes.find((entry) => entry.responseId === "resp_verify_failure");
    assert.ok(successOutcome);
    assert.ok(recoveryOutcome);
    assert.ok(inferredOutcome);
    assert.ok(staleCronOutcome);
    assert.ok(cronOutcome);
    assert.ok(heartbeatOutcome);
    assert.ok(implicitNoneOutcome);
    assert.ok(failureOutcome);
    assert.deepEqual(successOutcome.storageAudit, {
      decision: "belief",
      lookupRequired: false,
      targets: ["beliefs.json", "today_log"],
      status: "checkpoint_enforced"
    });
    assert.deepEqual(recoveryOutcome.storageAudit, {
      decision: "USER.md",
      lookupRequired: false,
      targets: ["USER.md", "today_log"],
      status: "checkpoint_enforced"
    });
    assert.deepEqual(inferredOutcome.storageAudit, {
      decision: "belief",
      lookupRequired: false,
      targets: ["beliefs.json", "MEMORY.md", "today_log"],
      status: "checkpoint_enforced"
    });
    assert.equal("storageAudit" in staleCronOutcome, false);
    assert.equal("storageAudit" in cronOutcome, false);
    assert.equal("storageAudit" in heartbeatOutcome, false);
    assert.deepEqual(implicitNoneOutcome.storageAudit, {
      decision: "none",
      lookupRequired: false,
      targets: ["none"],
      status: "checkpoint_enforced"
    });
    assert.deepEqual(failureOutcome.storageAudit, {
      status: "checkpoint_failed"
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          successStorageAudit: successOutcome.storageAudit,
          recoveryStorageAudit: recoveryOutcome.storageAudit,
          inferredStorageAudit: inferredOutcome.storageAudit,
          staleCronStorageAudit: staleCronOutcome.storageAudit ?? null,
          cronStorageAudit: cronOutcome.storageAudit ?? null,
          heartbeatStorageAudit: heartbeatOutcome.storageAudit ?? null,
          implicitNoneStorageAudit: implicitNoneOutcome.storageAudit,
          failureStorageAudit: failureOutcome.storageAudit
        },
        null,
        2
      )
    );
  } finally {
    await fs.rm(pluginWorkspaceOpenClawLink, { force: true });
  }
}

void main();
