#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import path from "node:path";

import { prepareSendContext } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  writeJson,
  writeState
} from "./open-loop-test-helpers";

function extractField(text: string, prefix: string): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function chicagoLocalDateYmd(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-owner-personal-presence");
  const previousWorldPath = process.env.AURORA_WORLD_STATE_PATH;
  const previousDesktopPath = process.env.AURORA_DESKTOP_CONTEXT_PATH;
  const previousGroundingEnabled = process.env.WORLD_GROUNDING_ENABLED;
  const worldPath = path.join(harness.tempDir, "world-state-latest.json");
  const desktopPath = path.join(harness.tempDir, "desktop-context-latest.json");
  const localDate = chicagoLocalDateYmd();

  try {
    process.env.AURORA_WORLD_STATE_PATH = worldPath;
    process.env.AURORA_DESKTOP_CONTEXT_PATH = desktopPath;
    process.env.WORLD_GROUNDING_ENABLED = "true";

    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize owner personal presence tracking verification.");

    await writeJson(desktopPath, {
      collectedAt: new Date().toISOString(),
      frontmostApp: "Messages",
      windowTitle: "Aurora Dashboard",
      browserDomain: "none",
      browserPageTitle: "none",
      contentMode: "communication",
      displayState: "awake",
      idleBucket: "active",
      powerSource: "battery",
      batteryPercent: 81,
      charging: false
    });

    await writeJson(worldPath, {
      generatedAt: new Date().toISOString(),
      localDate,
      localTime: "09:10",
      coarseStatus: { value: "work" },
      availability: { value: "work" },
      locationLabel: { value: "Woodstock job site" },
      locationKind: { value: "work" },
      calendar: { nextEvent: { summary: "Lunch around 12:00 PM" } },
      reminders: { todayCount: 0, overdueCount: 0 }
    });

    const workPreflight = await prepareSendContext({
      userText: "How has my day been feeling from your side?",
      sessionId: "agent:main:main"
    });

    assert.equal(extractField(workPreflight.enrichedInput, "owner_state_presence_mode="), "work");
    assert.equal(extractField(workPreflight.enrichedInput, "owner_state_presence_source="), "live_world");
    assert.match(
      extractField(workPreflight.enrichedInput, "owner_state_presence_summary="),
      /at Woodstock job site for work right now|at work right now/i
    );
    assert.match(
      extractField(workPreflight.enrichedInput, "owner_state_presence_rule="),
      /work mode right now/i
    );

    const homeState = await readState<Record<string, any>>(harness);
    homeState.extensions ??= {};
    const overrideAt = new Date().toISOString();
    homeState.extensions.ownerSameDayLocationOverride = {
      kind: "home",
      localDate,
      evidenceText: "Cade stayed home today and is not working.",
      at: overrideAt,
      homeConfirmed: true,
      notWorkingToday: true,
      updatedAt: overrideAt
    };
    await writeState(harness, homeState);

    const homePreflight = await prepareSendContext({
      userText: "How should you think about me right now?",
      sessionId: "agent:main:main"
    });

    assert.equal(extractField(homePreflight.enrichedInput, "owner_state_presence_mode="), "home");
    assert.equal(extractField(homePreflight.enrichedInput, "owner_state_presence_source="), "same_day_override");
    assert.match(
      extractField(homePreflight.enrichedInput, "owner_state_presence_summary="),
      /home today and not working/i
    );
    assert.match(
      extractField(homePreflight.enrichedInput, "owner_state_presence_rule="),
      /home or off work right now/i
    );

    const restingState = await readState<Record<string, any>>(harness);
    restingState.extensions.ownerSameDayLocationOverride = null;
    await writeState(harness, restingState);

    await writeJson(worldPath, {
      generatedAt: new Date().toISOString(),
      localDate,
      localTime: "02:05",
      coarseStatus: { value: "asleep" },
      availability: { value: "asleep" },
      locationLabel: { value: "home" },
      locationKind: { value: "home" },
      calendar: { nextEvent: { summary: "none" } },
      reminders: { todayCount: 0, overdueCount: 0 }
    });

    const restingPreflight = await prepareSendContext({
      userText: "How should you hold me in mind right now?",
      sessionId: "agent:main:main"
    });

    assert.equal(extractField(restingPreflight.enrichedInput, "owner_state_presence_mode="), "resting");
    assert.match(
      extractField(restingPreflight.enrichedInput, "owner_state_presence_summary="),
      /asleep or resting right now|resting right now/i
    );
    assert.match(
      extractField(restingPreflight.enrichedInput, "owner_state_presence_rule="),
      /gentle and low-demand/i
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          workPresence: extractField(workPreflight.enrichedInput, "owner_state_presence_summary="),
          homePresence: extractField(homePreflight.enrichedInput, "owner_state_presence_summary="),
          restingPresence: extractField(restingPreflight.enrichedInput, "owner_state_presence_summary=")
        },
        null,
        2
      )
    );
  } finally {
    restoreOpenLoopTestHarness(harness);
    if (typeof previousWorldPath === "undefined") {
      delete process.env.AURORA_WORLD_STATE_PATH;
    } else {
      process.env.AURORA_WORLD_STATE_PATH = previousWorldPath;
    }
    if (typeof previousDesktopPath === "undefined") {
      delete process.env.AURORA_DESKTOP_CONTEXT_PATH;
    } else {
      process.env.AURORA_DESKTOP_CONTEXT_PATH = previousDesktopPath;
    }
    if (typeof previousGroundingEnabled === "undefined") {
      delete process.env.WORLD_GROUNDING_ENABLED;
    } else {
      process.env.WORLD_GROUNDING_ENABLED = previousGroundingEnabled;
    }
  }
}

void main();
