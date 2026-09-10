"use client";

import { useEffect, useRef, useState } from "react";

interface SendPayload {
  text: string;
  sourceRect: DOMRect;
  font: string;
  color: string;
}

interface MessageInputProps {
  disabled: boolean;
  onSend: (payload: SendPayload) => void;
}

export default function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      setValue("");
      onSend({
        text,
        sourceRect: new DOMRect(24, window.innerHeight - 56, 480, 32),
        font: "500 16px 'Avenir Next', sans-serif",
        color: "#dbe9ff"
      });
      return;
    }

    const style = window.getComputedStyle(input);
    const sourceRect = input.getBoundingClientRect();

    setValue("");
    onSend({
      text,
      sourceRect,
      font: style.font || "500 16px 'Avenir Next', sans-serif",
      color: style.color || "#dbe9ff"
    });
  };

  return (
    <div className={`message-dock${open ? " is-open" : ""}`}>
      <form
        id="aurora-message-input"
        className={`message-input${open ? " is-open" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        aria-label="Send message"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Speak to Aurora"
          autoComplete="off"
          disabled={disabled || !open}
        />
        <button type="submit" disabled={disabled || value.trim().length === 0 || !open}>
          Send
        </button>
      </form>

      <button
        type="button"
        className="message-dock__toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="aurora-message-input"
      >
        {open ? "Close" : "Speak"}
      </button>
    </div>
  );
}
