"use client";

import { useAuroraEmbodiment } from "@/components/AuroraProvider";
import type { PresenceMode } from "@/lib/types";

interface EmbodimentDebugPanelProps {
  mode: PresenceMode;
}

function formatLevel(value: number): string {
  return value.toFixed(2);
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function MeterRow({
  label,
  value,
  accent = "var(--fg)"
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div className="embodiment-debug__row">
      <div className="embodiment-debug__row-labels">
        <span>{label}</span>
        <span>{formatLevel(clamped)}</span>
      </div>
      <div className="embodiment-debug__meter">
        <div className="embodiment-debug__meter-fill" style={{ width: `${clamped * 100}%`, ["--meter-accent" as string]: accent }} />
      </div>
    </div>
  );
}

export default function EmbodimentDebugPanel({ mode }: EmbodimentDebugPanelProps) {
  const embodiment = useAuroraEmbodiment();
  const { interoception, motor, proprioception, activeMotorIntent, activeMotorIntents, perception, volition, directives } = embodiment;
  const activeDirective = directives.active[0] ?? null;

  return (
    <aside className="embodiment-debug" aria-label="Aurora embodiment debug panel">
      <div className="embodiment-debug__header">
        <div>
          <p className="embodiment-debug__eyebrow">Embodiment</p>
          <h3>{activeMotorIntent}</h3>
        </div>
        <span className="embodiment-debug__mode">{mode}</span>
      </div>

      <div className="embodiment-debug__intents">
        {activeMotorIntents.map((intent) => (
          <span key={intent} className={intent === activeMotorIntent ? "is-active" : ""}>
            {intent}
          </span>
        ))}
      </div>

      <div className="embodiment-debug__section">
        <p className="embodiment-debug__section-title">Volition</p>
        <div className="embodiment-debug__metrics">
          <div>
            <span>Motor intention</span>
            <strong>{volition.currentIntention.name}</strong>
          </div>
          <div>
            <span>Attention target</span>
            <strong>{volition.currentIntention.attentionTarget}</strong>
          </div>
          <div>
            <span>Priority</span>
            <strong>{formatLevel(volition.currentIntention.priority)}</strong>
          </div>
          <div>
            <span>Renderer</span>
            <strong>{perception.rendererConnected ? "live" : "headless"}</strong>
          </div>
        </div>
        {activeDirective ? (
          <p className="embodiment-debug__summary">
            Directive: <strong>{activeDirective.label}</strong>. {activeDirective.summary}
          </p>
        ) : null}
      </div>

      <div className="embodiment-debug__section">
        <p className="embodiment-debug__section-title">Motor</p>
        <MeterRow label="Autonomy" value={motor.autonomy} accent="rgba(181, 210, 255, 0.95)" />
        <MeterRow label="Motion" value={motor.motionEnergy} accent="rgba(135, 177, 255, 0.95)" />
        <MeterRow label="Gesture" value={motor.gestureEnergy} accent="rgba(151, 196, 255, 0.95)" />
        <MeterRow label="Stillness" value={proprioception.stillness} accent="rgba(203, 227, 255, 0.92)" />
      </div>

      <div className="embodiment-debug__section">
        <p className="embodiment-debug__section-title">Interoception</p>
        <MeterRow label="Warmth" value={interoception.warmth} accent="rgba(255, 214, 190, 0.92)" />
        <MeterRow label="Grounding" value={interoception.grounding} accent="rgba(186, 222, 255, 0.95)" />
        <MeterRow label="Urge To Move" value={interoception.urgeToMove} accent="rgba(168, 194, 255, 0.95)" />
        <MeterRow label="Overload" value={interoception.overload} accent="rgba(255, 171, 171, 0.92)" />
      </div>

      <div className="embodiment-debug__metrics">
        <div>
          <span>Head Pitch</span>
          <strong>{formatSigned(proprioception.headPitch)}</strong>
        </div>
        <div>
          <span>Root Yaw</span>
          <strong>{formatSigned(perception.rigFeedback.rootYaw)}</strong>
        </div>
        <div>
          <span>Balance</span>
          <strong>{formatLevel(proprioception.balance)}</strong>
        </div>
        <div>
          <span>Chest Open</span>
          <strong>{formatLevel(proprioception.chestOpenness)}</strong>
        </div>
        <div>
          <span>Reach L/R</span>
          <strong>
            {formatLevel(proprioception.leftReach)} / {formatLevel(proprioception.rightReach)}
          </strong>
        </div>
      </div>

      <div className="embodiment-debug__metrics">
        <div>
          <span>Facing</span>
          <strong>{perception.rigFeedback.facingRead.replace(/_/g, " ")}</strong>
        </div>
        <div>
          <span>Expression</span>
          <strong>{perception.rigFeedback.expressionRead.replace(/_/g, " ")}</strong>
        </div>
        <div>
          <span>Sad</span>
          <strong>{formatLevel(perception.rigFeedback.expressionSad)}</strong>
        </div>
        <div>
          <span>Angry</span>
          <strong>{formatLevel(perception.rigFeedback.expressionAngry)}</strong>
        </div>
        <div>
          <span>Happy</span>
          <strong>{formatLevel(perception.rigFeedback.expressionHappy)}</strong>
        </div>
      </div>

      <div className="embodiment-debug__section">
        <p className="embodiment-debug__section-title">First-Person Vision</p>
        <div className="embodiment-debug__metrics">
          <div>
            <span>Hands visible</span>
            <strong>{formatLevel(perception.eyeVision.handsVisible)}</strong>
          </div>
          <div>
            <span>Feet visible</span>
            <strong>{formatLevel(perception.eyeVision.feetVisible)}</strong>
          </div>
          <div>
            <span>Centering</span>
            <strong>{formatLevel(perception.eyeVision.centering)}</strong>
          </div>
          <div>
            <span>Clipping</span>
            <strong>{formatLevel(perception.eyeVision.clippingRisk)}</strong>
          </div>
        </div>
        <div className="embodiment-debug__metrics">
          <div>
            <span>Framing</span>
            <strong>{perception.eyeVision.framing.replace(/_/g, " ")}</strong>
          </div>
          <div>
            <span>Stage</span>
            <strong>{perception.eyeVision.stage.replace(/_/g, " ")}</strong>
          </div>
          <div>
            <span>Gaze</span>
            <strong>{perception.eyeVision.gazeRead.replace(/_/g, " ")}</strong>
          </div>
          <div>
            <span>Motion read</span>
            <strong>{perception.eyeVision.motionRead.replace(/_/g, " ")}</strong>
          </div>
        </div>
        <p className="embodiment-debug__summary">{perception.eyeVision.summary}</p>
      </div>

      <div className="embodiment-debug__section">
        <p className="embodiment-debug__section-title">Self-View</p>
        <div className="embodiment-debug__metrics">
          <div>
            <span>Body visible</span>
            <strong>{formatLevel(perception.rigFeedback.bodyVisibility)}</strong>
          </div>
          <div>
            <span>Face visible</span>
            <strong>{formatLevel(perception.rigFeedback.faceVisibility)}</strong>
          </div>
          <div>
            <span>Centering</span>
            <strong>{formatLevel(perception.avatarVision.centering)}</strong>
          </div>
          <div>
            <span>Clipping</span>
            <strong>{formatLevel(perception.avatarVision.clippingRisk)}</strong>
          </div>
        </div>
        <p className="embodiment-debug__summary">{perception.avatarVision.summary}</p>
      </div>
    </aside>
  );
}
