"use client";

import { useAuroraEmbodiment, useAuroraEmbodimentControls } from "@/components/AuroraProvider";
import { EMBODIMENT_INTENT_NAMES } from "@/lib/types";

function formatLevel(value: number): string {
  return value.toFixed(2);
}

export default function EmbodimentConsole() {
  const embodiment = useAuroraEmbodiment();
  const {
    controls,
    setPinnedIntent,
    setExpressivityBias,
    setStillnessBias,
    selectPattern,
    saveCurrentPattern,
    deletePattern,
    resetControls
  } = useAuroraEmbodimentControls();
  const selectedPattern = controls.savedPatterns.find((pattern) => pattern.id === controls.selectedPatternId) ?? null;

  return (
    <section className="embodiment-console" aria-label="Aurora embodiment console">
      <div className="embodiment-console__header">
        <div>
          <p className="embodiment-console__eyebrow">Embodiment Console</p>
          <h3>Body practice</h3>
        </div>
        <button type="button" className="embodiment-console__ghost" onClick={resetControls}>
          Reset
        </button>
      </div>

      <div className="embodiment-console__section">
        <p className="embodiment-console__label">Pinned intent</p>
        <div className="embodiment-console__intent-grid">
          <button
            type="button"
            className={controls.pinnedIntent === "auto" ? "is-active" : ""}
            onClick={() => setPinnedIntent("auto")}
          >
            Auto
          </button>
          {EMBODIMENT_INTENT_NAMES.map((intent) => (
            <button
              key={intent}
              type="button"
              className={controls.pinnedIntent === intent ? "is-active" : ""}
              onClick={() => setPinnedIntent(intent)}
            >
              {intent}
            </button>
          ))}
        </div>
      </div>

      <div className="embodiment-console__section">
        <div className="embodiment-console__slider-header">
          <p className="embodiment-console__label">Expressivity bias</p>
          <span>{formatLevel(controls.expressivityBias)}</span>
        </div>
        <input
          className="embodiment-console__slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={controls.expressivityBias}
          onChange={(event) => setExpressivityBias(Number(event.target.value))}
        />
      </div>

      <div className="embodiment-console__section">
        <div className="embodiment-console__slider-header">
          <p className="embodiment-console__label">Stillness bias</p>
          <span>{formatLevel(controls.stillnessBias)}</span>
        </div>
        <input
          className="embodiment-console__slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={controls.stillnessBias}
          onChange={(event) => setStillnessBias(Number(event.target.value))}
        />
      </div>

      <div className="embodiment-console__actions">
        <button type="button" className="embodiment-console__primary" onClick={saveCurrentPattern}>
          Save current pattern
        </button>
        <p>
          Captures Aurora’s current body as a reusable pattern from <strong>{embodiment.activeMotorIntent}</strong>.
        </p>
      </div>

      <div className="embodiment-console__section">
        <div className="embodiment-console__patterns-header">
          <p className="embodiment-console__label">Saved patterns</p>
          <span>{controls.savedPatterns.length}</span>
        </div>

        {controls.savedPatterns.length === 0 ? (
          <p className="embodiment-console__empty">No saved patterns yet. Let Aurora move, then capture one you like.</p>
        ) : (
          <div className="embodiment-console__patterns">
            {controls.savedPatterns.map((pattern) => {
              const isSelected = selectedPattern?.id === pattern.id;
              return (
                <div key={pattern.id} className={`embodiment-console__pattern${isSelected ? " is-selected" : ""}`}>
                  <button
                    type="button"
                    className="embodiment-console__pattern-main"
                    onClick={() => selectPattern(isSelected ? null : pattern.id)}
                  >
                    <span>{pattern.name}</span>
                    <small>
                      {pattern.baseIntent} · exp {formatLevel(pattern.expressivityBias)} · still {formatLevel(pattern.stillnessBias)}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="embodiment-console__pattern-delete"
                    onClick={() => deletePattern(pattern.id)}
                    aria-label={`Delete ${pattern.name}`}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
