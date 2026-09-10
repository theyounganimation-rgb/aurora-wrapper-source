"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import BlobCanvas from "@/components/BlobCanvas";
import { useAuroraEmbodiment, useAuroraEmbodimentControls } from "@/components/AuroraProvider";
import type { AuroraEmbodimentObservationInput, AuroraEmbodimentState, AuroraState, PresenceMode } from "@/lib/types";

type AvatarLoadState = "loading" | "ready" | "missing" | "error";

interface AvatarCanvasModuleProps {
  auroraState: AuroraState;
  embodimentState: AuroraEmbodimentState;
  mode: PresenceMode;
  curiosityLevel: number;
  activityLevel: number;
  activityPulse: number;
  modelUrl: string;
  onStatusChange?: (status: { state: AvatarLoadState; message?: string }) => void;
  onObservation?: (observation: AuroraEmbodimentObservationInput) => void;
}

const AuroraAvatarCanvas = dynamic<AvatarCanvasModuleProps>(() => import("@/components/AuroraAvatarCanvas"), {
  ssr: false
});

interface AuroraAvatarPresenceProps {
  auroraState: AuroraState;
  mode: PresenceMode;
  curiosityLevel: number;
  activityLevel: number;
  activityPulse: number;
}

function defaultAvatarUrl(): string {
  const configured = process.env.NEXT_PUBLIC_AURORA_VRM_URL?.trim();
  const baseUrl = configured || "/avatars/Aurora1.2.vrm";
  const version = process.env.NEXT_PUBLIC_AURORA_VRM_VERSION?.trim() || "aurora-1-2";
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}v=${encodeURIComponent(version)}`;
}

function overlayTitle(loadState: AvatarLoadState): string {
  if (loadState === "ready") {
    return "Aurora body online";
  }

  if (loadState === "loading") {
    return "Shaping Aurora's body";
  }

  if (loadState === "missing") {
    return "Aurora needs a VRM body";
  }

  return "Aurora body could not load";
}

function overlayBody(loadState: AvatarLoadState, modelUrl: string, message?: string): string {
  if (loadState === "ready") {
    return `Loaded from ${modelUrl}`;
  }

  if (loadState === "loading") {
    return "The avatar stage is live. Once a VRM file is present, Aurora will inhabit it here.";
  }

  if (loadState === "missing") {
    return message || `Add a VRM to ${modelUrl} or point NEXT_PUBLIC_AURORA_VRM_URL at Aurora's model.`;
  }

  return message || "The avatar renderer hit an unexpected VRM loading error.";
}

export default function AuroraAvatarPresence(props: AuroraAvatarPresenceProps) {
  const embodimentState = useAuroraEmbodiment();
  const { reportAvatarObservation } = useAuroraEmbodimentControls();
  const modelUrl = useMemo(() => defaultAvatarUrl(), []);
  const [loadState, setLoadState] = useState<AvatarLoadState>("loading");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const handleStatusChange = useCallback(
    (status: { state: AvatarLoadState; message?: string }) => {
      setLoadState(status.state);
      setStatusMessage(status.message || "");
    },
    []
  );

  return (
    <div className="avatar-presence-shell">
      <div className={`avatar-backdrop avatar-backdrop--${loadState}`}>
        <BlobCanvas
          mode={props.mode}
          curiosityLevel={props.curiosityLevel}
          activityLevel={props.activityLevel}
          activityPulse={props.activityPulse}
        />
      </div>

      <div className="avatar-stage">
        <AuroraAvatarCanvas
          {...props}
          embodimentState={embodimentState}
          modelUrl={modelUrl}
          onStatusChange={handleStatusChange}
          onObservation={reportAvatarObservation}
        />
      </div>

      {loadState !== "ready" ? (
        <div className={`avatar-overlay avatar-overlay--${loadState}`}>
          <p className="avatar-overlay__eyebrow">VRM Presence</p>
          <h2>{overlayTitle(loadState)}</h2>
          <p>{overlayBody(loadState, modelUrl, statusMessage)}</p>
        </div>
      ) : null}
    </div>
  );
}
