"use client";

import { useMemo, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import FlowingReplyText from "@/components/FlowingReplyText";

interface ConversationPanelProps {
  messages: ChatMessage[];
  historyLimit: number;
}

function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function ConversationPanel({ messages, historyLimit }: ConversationPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(
    () => (expanded ? messages : messages.slice(-historyLimit)),
    [expanded, historyLimit, messages]
  );

  return (
    <section className="conversation-panel" aria-label="Conversation">
      <header className="conversation-panel__header">
        <span>Conversation</span>
        <span>{messages.length} turns</span>
      </header>

      <div className="conversation-panel__body">
        {visible.length === 0 ? (
          <p className="conversation-empty">Messages will appear here after you send the first prompt.</p>
        ) : (
          visible.map((message) => (
            <article
              key={message.id}
              className={`chat-bubble chat-bubble--${message.role} chat-bubble--${message.status}`}
            >
              <header className="chat-bubble__meta">
                <span>{message.role === "aurora" ? "Aurora" : "You"}</span>
                <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
              </header>
              {message.role === "aurora" ? (
                <FlowingReplyText text={message.text} isStreaming={message.status === "streaming"} />
              ) : (
                <p>{message.text}</p>
              )}
            </article>
          ))
        )}
      </div>

      {messages.length > historyLimit ? (
        <button
          type="button"
          className="expand-history-button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show recent only" : "Expand history"}
        </button>
      ) : null}
    </section>
  );
}
