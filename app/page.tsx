"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import ContinuityFeed from "@/components/ContinuityFeed";
import ConversationPanel from "@/components/ConversationPanel";
import EmbodimentConsole from "@/components/EmbodimentConsole";
import EmbodimentDebugPanel from "@/components/EmbodimentDebugPanel";
import MessageInput from "@/components/MessageInput";
import SendDissipateCanvas, { type SendDissipateHandle } from "@/components/SendDissipateCanvas";
import { AuroraProvider, useAurora } from "@/components/AuroraProvider";
import type { AuroraState, PresenceMode } from "@/lib/types";

interface AuroraAvatarPresenceProps {
  auroraState: AuroraState;
  mode: PresenceMode;
  curiosityLevel: number;
  activityLevel: number;
  activityPulse: number;
}

function AvatarPresenceBootShell() {
  return (
    <div className="avatar-presence-shell" aria-busy="true">
      <div className="avatar-backdrop avatar-backdrop--loading" />
      <div className="avatar-stage" />
      <div className="avatar-overlay avatar-overlay--loading">
        <p className="avatar-overlay__eyebrow">VRM Presence</p>
        <h2>Shaping Aurora&apos;s body</h2>
        <p>The avatar renderer is warming up without blocking Aurora&apos;s camera and conversation shell.</p>
      </div>
    </div>
  );
}

function AvatarPresenceSlot(props: AuroraAvatarPresenceProps) {
  const [AvatarPresenceComponent, setAvatarPresenceComponent] =
    useState<ComponentType<AuroraAvatarPresenceProps> | null>(null);

  useEffect(() => {
    let active = true;
    void import("@/components/AuroraAvatarPresence").then((module) => {
      if (!active) {
        return;
      }
      setAvatarPresenceComponent(() => module.default);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!AvatarPresenceComponent) {
    return <AvatarPresenceBootShell />;
  }

  return <AvatarPresenceComponent {...props} />;
}

function modeLabel(mode: PresenceMode): string {
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

function statusClass(mode: PresenceMode): string {
  if (mode === "thinking") {
    return " is-thinking";
  }

  if (mode === "heartbeat_recent") {
    return " is-heartbeat";
  }

  return "";
}

function AuroraScreen() {
  const { auroraState, uiState, messages, isSending, sendUserMessage, historyLimit, activityPulse, refreshState } =
    useAurora();
  const [feedOpen, setFeedOpen] = useState(true);
  const dissipateRef = useRef<SendDissipateHandle | null>(null);

  return (
    <main className="aurora-app">
      <section className="presence-zone">
        <div className="presence-stack">
          <div className="blob-shell" aria-label="Aurora presence object">
            <AvatarPresenceSlot
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

        <ConversationPanel messages={messages} historyLimit={historyLimit} />
      </section>

      <ContinuityFeed
        state={auroraState}
        open={feedOpen}
        onToggle={() => setFeedOpen((open) => !open)}
        onRefresh={() => {
          void refreshState();
        }}
      />

      <MessageInput
        disabled={isSending}
        onSend={(payload) => {
          dissipateRef.current?.spawn(payload);
          void sendUserMessage(payload.text);
        }}
      />

      <SendDissipateCanvas ref={dissipateRef} />
    </main>
  );
}

export default function Home() {
  return (
    <AuroraProvider>
      <AuroraScreen />
    </AuroraProvider>
  );
}
