"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/components/CodiApp.module.css";

type CodiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  phase: "user" | "commentary" | "final_answer" | "error";
  pending: boolean;
};

type SnapshotPayload = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  activeThread?: {
    id: string;
    title: string;
    preview: string;
    updatedAt: string | null;
    status: string;
  } | null;
  messages?: CodiMessage[];
  pendingTurn?: boolean;
  resolver?: {
    source: string;
    confidence: number;
    resolvedAt: string;
  };
  server?: {
    defaultRemoteBaseUrl: string;
  };
};

type OptimisticMessage = {
  id: string;
  role: "user";
  text: string;
  phase: "user";
  pending: true;
};

const IDLE_POLL_MS = 1_600;
const ACTIVE_POLL_MS = 700;

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function mergeMessages(remoteMessages: CodiMessage[], optimisticMessages: OptimisticMessage[]): CodiMessage[] {
  if (!optimisticMessages.length) {
    return remoteMessages;
  }

  const remoteKeys = new Set(
    remoteMessages.map((message) => `${message.role}:${normalizeComparableText(message.text)}`)
  );

  const remainingOptimistic = optimisticMessages.filter(
    (message) => !remoteKeys.has(`${message.role}:${normalizeComparableText(message.text)}`)
  );

  return [...remoteMessages, ...remainingOptimistic];
}

function phaseLabel(phase: CodiMessage["phase"]): string {
  if (phase === "final_answer") {
    return "Final";
  }

  if (phase === "commentary") {
    return "Live";
  }

  if (phase === "error") {
    return "Error";
  }

  return "You";
}

export default function CodiApp() {
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  const combinedMessages = useMemo(() => {
    return mergeMessages(snapshot?.messages ?? [], optimisticMessages);
  }, [optimisticMessages, snapshot?.messages]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [combinedMessages.length, snapshot?.activeThread?.id]);

  useEffect(() => {
    let cancelled = false;

    const fetchSnapshot = async (reason: "load" | "poll") => {
      if (reason === "poll") {
        setRefreshing(true);
      }

      try {
        const response = await fetch("/api/codi/snapshot", {
          cache: "no-store"
        });

        const payload = (await response.json()) as SnapshotPayload;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Snapshot request failed (${response.status}).`);
        }

        if (!cancelled) {
          setSnapshot(payload);
          setError("");
          setOptimisticMessages((current) =>
            current.filter((message) => {
              const remoteMessages = payload.messages ?? [];
              return !remoteMessages.some(
                (candidate) =>
                  candidate.role === message.role &&
                  normalizeComparableText(candidate.text) === normalizeComparableText(message.text)
              );
            })
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to refresh the live Codex mirror.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void fetchSnapshot("load");
    const timer = window.setInterval(() => {
      void fetchSnapshot("poll");
    }, sending || snapshot?.pendingTurn ? ACTIVE_POLL_MS : IDLE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sending, snapshot?.pendingTurn]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) {
      return;
    }

    const optimistic: OptimisticMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      text,
      phase: "user",
      pending: true
    };

    setDraft("");
    setSending(true);
    setOptimisticMessages((current) => [...current, optimistic]);
    setError("");

    try {
      const response = await fetch("/api/codi/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Send failed (${response.status}).`);
      }

      const snapshotResponse = await fetch("/api/codi/snapshot", {
        cache: "no-store"
      });
      const snapshotPayload = (await snapshotResponse.json()) as SnapshotPayload;
      if (snapshotResponse.ok && snapshotPayload.ok) {
        setSnapshot(snapshotPayload);
      }
    } catch (err) {
      setDraft(text);
      setOptimisticMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setError(err instanceof Error ? err.message : "Failed to send the message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.app}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <div>
              <p className={styles.eyebrow}>Codi</p>
              <h1 className={styles.title}>{snapshot?.activeThread?.title || "Waiting for Codex"}</h1>
              <p className={styles.threadPreview}>
                {snapshot?.activeThread?.preview ||
                  "Codi mirrors the Codex thread that is actually on screen on your Mac."}
              </p>
            </div>

            <div className={styles.badgeRow}>
              <span className={`${styles.badge} ${styles.badgeStrong}`}>
                {snapshot?.pendingTurn || sending ? "Syncing live" : "Mirrored"}
              </span>
              <span className={styles.badge}>
                {snapshot?.resolver?.source === "ocr" ? "Visible thread via OCR" : "Fallback thread selection"}
              </span>
              <span className={styles.badge}>
                {refreshing ? "Refreshing" : snapshot?.activeThread?.status || "No thread"}
              </span>
            </div>
          </div>

          {error ? <div className={styles.errorCard}>{error}</div> : null}
        </header>

        <section className={styles.mirror} aria-live="polite">
          <div className={styles.messageList} ref={listRef}>
            {combinedMessages.length ? (
              combinedMessages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.messageGroup} ${
                    message.role === "user" ? styles.messageGroupUser : styles.messageGroupAssistant
                  }`}
                >
                  <article
                    className={`${styles.bubble} ${
                      message.role === "user" ? styles.bubbleUser : styles.bubbleAssistant
                    } ${message.pending ? styles.bubblePending : ""}`}
                  >
                    <div className={`${styles.meta} ${message.role === "user" ? styles.metaUser : ""}`}>
                      <span>{message.role === "user" ? "You" : "Codex"}</span>
                      {message.role === "assistant" ? (
                        <span
                          className={`${styles.phase} ${
                            message.phase === "final_answer"
                              ? styles.phaseFinal
                              : message.phase === "error"
                                ? styles.phaseError
                                : styles.phaseCommentary
                          }`}
                        >
                          {phaseLabel(message.phase)}
                        </span>
                      ) : null}
                      {message.pending ? <span>Pending</span> : null}
                    </div>
                    <p className={styles.text}>{message.text}</p>
                  </article>
                </div>
              ))
            ) : (
              <div className={styles.messageGroup}>
                <article className={`${styles.bubble} ${styles.bubbleAssistant}`}>
                  <div className={styles.meta}>
                    <span>Codex</span>
                    <span className={`${styles.phase} ${styles.phaseCommentary}`}>{loading ? "Loading" : "Idle"}</span>
                  </div>
                  <p className={styles.text}>
                    {loading
                      ? "Reading the current Codex thread from your Mac."
                      : "Open a thread in Codex on your Mac and Codi will mirror it here."}
                  </p>
                </article>
              </div>
            )}
          </div>
        </section>

        <div className={styles.composer}>
          <textarea
            className={styles.composerField}
            placeholder="Message the Codex thread that is open on your Mac…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={sending}
          />
          <button
            className={styles.sendButton}
            onClick={() => {
              void handleSend();
            }}
            disabled={!draft.trim() || sending}
          >
            {sending ? "Sending…" : "Send to Codex"}
          </button>
        </div>
      </div>
    </main>
  );
}
