"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TranscriptMessage {
  id: string;
  timestamp: string;
  role: "user" | "assistant";
  text: string;
}

interface TranscriptResponse {
  ok: boolean;
  error?: string;
  sessionKey?: string;
  sessionId?: string;
  storePath?: string;
  sessionFile?: string;
  totalMessages?: number;
  limit?: number;
  offset?: number;
  hasOlder?: boolean;
  hasNewer?: boolean;
  messages?: TranscriptMessage[];
}

const POLL_MS = 3500;
const FETCH_LIMIT = 160;

type FetchReason = "load" | "poll" | "manual" | "older";

function mergeById(first: TranscriptMessage[], second: TranscriptMessage[]): TranscriptMessage[] {
  const seen = new Set<string>();
  const merged: TranscriptMessage[] = [];

  for (const message of [...first, ...second]) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    merged.push(message);
  }

  return merged;
}

function formatTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return iso;
  }
  return new Date(parsed).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function CodexLinkMonitor() {
  const [data, setData] = useState<TranscriptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [scrollPercent, setScrollPercent] = useState(100);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const sliderDraggingRef = useRef(false);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const previousTailIdRef = useRef<string>("");
  const previousCountRef = useRef(0);

  const readFeedScrollPercent = useCallback((feed: HTMLDivElement): number => {
    const max = Math.max(feed.scrollHeight - feed.clientHeight, 0);
    if (max <= 0) {
      return 100;
    }
    return Math.round((feed.scrollTop / max) * 100);
  }, []);

  const scrollFeedFromPercent = useCallback((nextPercent: number) => {
    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    const clamped = Math.min(Math.max(nextPercent, 0), 100);
    const max = Math.max(feed.scrollHeight - feed.clientHeight, 0);
    feed.scrollTop = (max * clamped) / 100;
    setScrollPercent(clamped);
    setStickToBottom(clamped >= 99.5);
  }, []);

  const scrollFeedFromPointer = useCallback(
    (clientY: number) => {
      const track = sliderTrackRef.current;
      if (!track) {
        return;
      }

      const rect = track.getBoundingClientRect();
      const ratio = (clientY - rect.top) / Math.max(rect.height, 1);
      scrollFeedFromPercent(ratio * 100);
    },
    [scrollFeedFromPercent]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!sliderDraggingRef.current) {
        return;
      }
      scrollFeedFromPointer(event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!sliderDraggingRef.current) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      scrollFeedFromPointer(touch.clientY);
      event.preventDefault();
    };

    const stopDragging = () => {
      sliderDraggingRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopDragging);
    window.addEventListener("touchcancel", stopDragging);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopDragging);
      window.removeEventListener("touchcancel", stopDragging);
    };
  }, [scrollFeedFromPointer]);

  const fetchTranscript = useCallback(
    async ({
      reason,
      offset = 0,
      signal
    }: {
      reason: FetchReason;
      offset?: number;
      signal?: AbortSignal;
    }) => {
      if (reason === "manual") {
        setRefreshing(true);
      }
      if (reason === "load") {
        setLoading(true);
      }
      if (reason === "older") {
        setLoadingOlder(true);
        const feed = feedRef.current;
        if (feed) {
          prependAnchorRef.current = {
            scrollHeight: feed.scrollHeight,
            scrollTop: feed.scrollTop
          };
        }
      }

      try {
        const response = await fetch(`/api/aurora/codex-link/transcript?limit=${FETCH_LIMIT}&offset=${offset}`, {
          cache: "no-store",
          signal
        });

        const payload = (await response.json()) as TranscriptResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Transcript request failed (${response.status}).`);
        }

        setData((previous) => {
          const previousMessages = previous?.messages ?? [];
          const incomingMessages = payload.messages ?? [];
          const mergedMessages =
            offset > 0
              ? mergeById(incomingMessages, previousMessages)
              : mergeById(previousMessages, incomingMessages);

          return {
            ...payload,
            messages: mergedMessages
          };
        });
        setError("");
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        prependAnchorRef.current = null;
        const message = err instanceof Error ? err.message : "Failed to load transcript.";
        setError(message);
      } finally {
        if (reason === "manual") {
          setRefreshing(false);
        }
        if (reason === "load") {
          setLoading(false);
        }
        if (reason === "older") {
          setLoadingOlder(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";

    const controller = new AbortController();
    void fetchTranscript({ reason: "load", signal: controller.signal });
    return () => {
      controller.abort();
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [fetchTranscript]);

  useEffect(() => {
    if (!autoRefresh || loadingOlder) {
      return;
    }
    const controller = new AbortController();
    const timer = setInterval(() => {
      void fetchTranscript({ reason: "poll", signal: controller.signal });
    }, POLL_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [autoRefresh, fetchTranscript, loadingOlder]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    const prependAnchor = prependAnchorRef.current;
    if (prependAnchor) {
      const delta = feed.scrollHeight - prependAnchor.scrollHeight;
      feed.scrollTop = prependAnchor.scrollTop + delta;
      prependAnchorRef.current = null;
      const anchorMessages = data?.messages ?? [];
      previousCountRef.current = anchorMessages.length;
      previousTailIdRef.current = anchorMessages[anchorMessages.length - 1]?.id ?? "";
      setScrollPercent(readFeedScrollPercent(feed));
      return;
    }

    const currentMessages = data?.messages ?? [];
    const currentCount = currentMessages.length;
    const currentTailId = currentMessages[currentCount - 1]?.id ?? "";
    const hasNewTail =
      (currentCount > previousCountRef.current && currentTailId !== "") ||
      (currentCount === previousCountRef.current &&
        currentTailId !== "" &&
        currentTailId !== previousTailIdRef.current);

    if (!stickToBottom || !hasNewTail) {
      previousCountRef.current = currentCount;
      previousTailIdRef.current = currentTailId;
      setScrollPercent(readFeedScrollPercent(feed));
      return;
    }

    feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
    previousCountRef.current = currentCount;
    previousTailIdRef.current = currentTailId;
    setScrollPercent(100);
  }, [data?.messages, readFeedScrollPercent, stickToBottom]);

  const messages = useMemo(() => data?.messages ?? [], [data?.messages]);
  const totalMessages = data?.totalMessages ?? 0;
  const hasOlder = messages.length > 0 && messages.length < totalMessages;
  const thumbPercent = Math.min(Math.max(scrollPercent, 2), 98);

  return (
    <main className="codex-link-page">
      <header className="codex-link-header">
        <h1>Codex Link Monitor</h1>
        <p>Live view of the isolated Codex ↔ Aurora coordination thread.</p>

        <div className="codex-link-actions">
          <button
            type="button"
            className="codex-link-button"
            disabled={refreshing}
            onClick={() => {
              void fetchTranscript({ reason: "manual" });
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>

          <label className="codex-link-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto-refresh
          </label>
        </div>

        <div className="codex-link-meta">
          <p>
            <span>Session key:</span> {data?.sessionKey ?? "loading..."}
          </p>
          <p>
            <span>Session id:</span> {data?.sessionId ?? "loading..."}
          </p>
          <p>
            <span>Messages:</span> {messages.length} loaded / {totalMessages} total
          </p>
        </div>
      </header>

      <section className="codex-link-panel" aria-label="Codex link transcript">
        {loading ? (
          <p className="codex-link-empty">Loading transcript...</p>
        ) : error ? (
          <p className="codex-link-error">{error}</p>
        ) : (
          <div className="codex-link-transcript-shell">
            <div
              className="codex-link-feed"
              ref={feedRef}
              onScroll={(event) => {
                const target = event.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                setStickToBottom(remaining < 64);
                setScrollPercent(readFeedScrollPercent(target));
              }}
            >
              <div className="codex-link-history">
                {hasOlder ? (
                  <button
                    type="button"
                    className="codex-link-button codex-link-button--history"
                    disabled={loadingOlder}
                    onClick={() => {
                      void fetchTranscript({
                        reason: "older",
                        offset: messages.length
                      });
                    }}
                  >
                    {loadingOlder ? "Loading older..." : "Load older messages"}
                  </button>
                ) : (
                  <p className="codex-link-history__status">Showing all available history.</p>
                )}
              </div>

              {messages.length === 0 ? (
                <p className="codex-link-empty">No user/assistant messages found yet.</p>
              ) : (
                messages.map((message) => (
                  <article key={message.id} className={`codex-link-bubble codex-link-bubble--${message.role}`}>
                    <header className="codex-link-bubble__meta">
                      <span>{message.role === "assistant" ? "Aurora" : "Codex"}</span>
                      <time dateTime={message.timestamp}>{formatTime(message.timestamp)}</time>
                    </header>
                    <p>{message.text}</p>
                  </article>
                ))
              )}
            </div>

            <aside className="codex-link-slider" aria-label="Transcript position slider">
              <button
                type="button"
                className="codex-link-slider__jump"
                onClick={() => {
                  scrollFeedFromPercent(0);
                }}
              >
                Top
              </button>
              <div
                className="codex-link-slider__track"
                ref={sliderTrackRef}
                role="slider"
                tabIndex={0}
                aria-label="Transcript scroll position"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(scrollPercent)}
                onMouseDown={(event) => {
                  sliderDraggingRef.current = true;
                  scrollFeedFromPointer(event.clientY);
                }}
                onTouchStart={(event) => {
                  sliderDraggingRef.current = true;
                  const touch = event.touches[0];
                  if (touch) {
                    scrollFeedFromPointer(touch.clientY);
                  }
                }}
                onClick={(event) => {
                  scrollFeedFromPointer(event.clientY);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    scrollFeedFromPercent(scrollPercent - 6);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    scrollFeedFromPercent(scrollPercent + 6);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    scrollFeedFromPercent(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    scrollFeedFromPercent(100);
                  }
                }}
              >
                <div className="codex-link-slider__rail" />
                <div className="codex-link-slider__thumb" style={{ top: `${thumbPercent}%` }} />
              </div>
              <button
                type="button"
                className="codex-link-slider__jump"
                onClick={() => {
                  scrollFeedFromPercent(100);
                }}
              >
                Bottom
              </button>
            </aside>
          </div>
        )}
      </section>

      <footer className="codex-link-footer">
        <p>
          <span>Store:</span> {data?.storePath ?? "n/a"}
        </p>
        <p>
          <span>Transcript:</span> {data?.sessionFile ?? "n/a"}
        </p>
      </footer>
    </main>
  );
}
