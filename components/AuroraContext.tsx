"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_AURORA_STATE,
  DEFAULT_AURORA_UI_STATE,
  type AuroraState,
  type AuroraUiState,
  type ChatMessage
} from "@/lib/types";

export interface AuroraContextValue {
  auroraState: AuroraState;
  uiState: AuroraUiState;
  messages: ChatMessage[];
  isSending: boolean;
  historyLimit: number;
  activityPulse: number;
  sendUserMessage: (text: string) => Promise<void>;
  refreshState: () => Promise<void>;
}

const DEFAULT_AURORA_CONTEXT_VALUE: AuroraContextValue = {
  auroraState: DEFAULT_AURORA_STATE,
  uiState: DEFAULT_AURORA_UI_STATE,
  messages: [],
  isSending: false,
  historyLimit: 12,
  activityPulse: 0,
  sendUserMessage: async () => undefined,
  refreshState: async () => undefined
};

const AuroraContext = createContext<AuroraContextValue | null>(null);

export function AuroraContextBridgeProvider({
  value,
  children
}: {
  value: AuroraContextValue;
  children: ReactNode;
}) {
  return <AuroraContext.Provider value={value}>{children}</AuroraContext.Provider>;
}

export function AuroraKernelOnlyProvider({
  children,
  auroraState = DEFAULT_AURORA_STATE
}: {
  children: ReactNode;
  auroraState?: AuroraState;
}) {
  const value = useMemo<AuroraContextValue>(
    () => ({
      ...DEFAULT_AURORA_CONTEXT_VALUE,
      auroraState
    }),
    [auroraState]
  );

  return <AuroraContext.Provider value={value}>{children}</AuroraContext.Provider>;
}

export function useAurora(): AuroraContextValue {
  const context = useContext(AuroraContext);
  if (!context) {
    throw new Error("useAurora must be used inside AuroraProvider.");
  }

  return context;
}
