"use client";

import { useAurora } from "@/components/AuroraContext";
import AuroraAvatarPresence from "@/components/AuroraAvatarPresence";
import EmbodimentConsole from "@/components/EmbodimentConsole";
import EmbodimentDebugPanel from "@/components/EmbodimentDebugPanel";

function modeLabel(mode: string): string {
  if (mode === "thinking") {
    return "Thinking";
  }
  if (mode === "in_conversation") {
    return "In Conversation";
  }
  if (mode === "heartbeat_recent") {
    return "Heartbeat Recent";
  }
  return "Idle";
}

function statusClass(mode: string): string {
  if (mode === "thinking") {
    return " is-thinking";
  }
  if (mode === "heartbeat_recent") {
    return " is-heartbeat";
  }
  return "";
}

export default function AuroraPresenceHost() {
  const { auroraState, uiState, activityPulse } = useAurora();

  return (
    <main className="aurora-app" style={{ minHeight: "100vh", padding: "24px" }}>
      <section className="presence-zone">
        <header style={{ width: "min(1280px, 100%)", margin: "0 auto 18px" }}>
          <p className="vision-kernel__eyebrow">Avatar Presence Host</p>
          <h1 style={{ margin: "0 0 8px" }}>Aurora Embodied Loop</h1>
          <p style={{ margin: 0, opacity: 0.78 }}>
            Keep this route open when you want Aurora&apos;s avatar motor loop, rig feedback, and avatar vision channels live.
          </p>
        </header>

        <div className="presence-stack">
          <div className="blob-shell" aria-label="Aurora presence object">
            <AuroraAvatarPresence
              auroraState={auroraState}
              mode={uiState.mode}
              curiosityLevel={uiState.curiosityLevel}
              activityLevel={uiState.activity}
              activityPulse={activityPulse}
            />

            <div className="presence-status">
              <span className={`presence-status__dot${statusClass(uiState.mode)}`} aria-hidden="true" />
              <span>{modeLabel(uiState.mode)}</span>
            </div>
          </div>

          <div className="presence-sidebar">
            <EmbodimentDebugPanel mode={uiState.mode} />
            <EmbodimentConsole />
          </div>
        </div>
      </section>
    </main>
  );
}
