"use client";

import type { AuroraState } from "@/lib/types";

interface ContinuityFeedProps {
  state: AuroraState;
  open: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No heartbeat yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function FeedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="feed-row">
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

export default function ContinuityFeed({ state, open, onToggle, onRefresh }: ContinuityFeedProps) {
  const cognition = state.cognition;
  const extensions = cognition.extensions;
  const topDrive = extensions?.drives?.[0];
  const commitmentSummary = extensions?.commitments;
  const projectSummary = extensions?.projects;
  const interioritySummary = extensions?.interiority;
  const beliefSummary = extensions?.beliefs;
  const appraisalSummary = extensions?.appraisal;
  const relationshipSummary = extensions?.relationship;
  const interactionSummary = extensions?.interaction;
  const governanceSummary = extensions?.governance;
  const personaSummary = extensions?.persona;
  const worldGrounding = extensions?.worldGrounding;
  const topInteriorityConcern = interioritySummary?.topConcern;
  const recentImprint = interioritySummary?.recentImprint;
  const hasRelationshipOrModeHistory =
    (relationshipSummary?.topicSensitivity.length ?? 0) + (interactionSummary?.history.length ?? 0) > 0;
  const emotions = `valence ${cognition.emotion.valence.toFixed(2)} · arousal ${cognition.emotion.arousal.toFixed(
    2
  )} · stress ${cognition.emotion.stress.toFixed(2)} · uncertainty ${cognition.emotion.uncertainty.toFixed(2)}`;

  return (
    <aside className={`continuity-panel${open ? "" : " continuity-panel--closed"}`}>
      <button className="continuity-panel__toggle" type="button" onClick={onToggle}>
        {open ? "Hide" : "Feed"}
      </button>

      <div className="continuity-panel__content">
        <header className="continuity-panel__header">
          <h2>Continuity Feed</h2>
          <button type="button" className="continuity-refresh" onClick={onRefresh}>
            Refresh
          </button>
        </header>

        <dl>
          <FeedRow label="lastHeartbeat.timestamp" value={formatTimestamp(state.lastHeartbeat.timestamp)} />
          <FeedRow label="whatIDid" value={state.lastHeartbeat.whatIDid} />
          <FeedRow label="whatILearned" value={state.lastHeartbeat.whatILearned} />
          <FeedRow label="whatImCuriousAbout" value={state.lastHeartbeat.whatImCuriousAbout} />
          <FeedRow
            label="workspace.focus"
            value={cognition.workspace.focus || cognition.attention.currentFocus || "No active focus"}
          />
          <FeedRow label="controller.decision" value={`${cognition.controller.decision} — ${cognition.controller.rationale}`} />
          <FeedRow label="emotion.state" value={`${cognition.emotion.label} (${emotions})`} />
          <FeedRow
            label="hormones.thresholds"
            value={`attention ${cognition.hormones.attentionThreshold.toFixed(2)} · reflection ${cognition.hormones.reflectionThreshold.toFixed(2)}`}
          />
          <FeedRow
            label="attention.queue"
            value={`depth ${cognition.attention.queueDepth} · top ${formatPercent(cognition.attention.topPriority)} · processed/min ${cognition.attention.processedLastMinute}`}
          />
          <FeedRow
            label="reflection.channel"
            value={`last ${formatTimestamp(cognition.reflection.lastReflectionAt)} · interval ${Math.round(cognition.reflection.intervalMs / 1000)}s`}
          />
          <FeedRow
            label="worldGrounding.vision"
            value={
              worldGrounding
                ? `${worldGrounding.vision.status} · ${worldGrounding.vision.sceneState.summary}`
                : "-"
            }
          />
          <FeedRow
            label="vision.rawBuffer"
            value={worldGrounding?.vision.disclosure.rawBufferStatus || "-"}
          />
          <FeedRow
            label="vision.privacy"
            value={
              worldGrounding
                ? `local ${worldGrounding.vision.privacyKernel.rawLocalOnly ? "yes" : "no"} · disclosure ${
                    worldGrounding.vision.privacyKernel.cameraDisclosureVisible ? "visible" : "hidden"
                  } · redactions ${worldGrounding.vision.disclosure.redacted.join(", ") || "none"}`
                : "-"
            }
          />
          <FeedRow
            label="integration"
            value={`score ${formatPercent(cognition.integration.score)} · coupling ${formatPercent(
              cognition.integration.coupling
            )} · feedback loops ${cognition.integration.feedbackLoops}`}
          />
          <FeedRow
            label="compliance"
            value={`checks ${cognition.compliance.totalChecks} · blocked ${cognition.compliance.blockedChecks} · gate ${cognition.compliance.lastGate} · prompt bytes ${cognition.compliance.lastPromptBytes}`}
          />
          <FeedRow
            label="introspection"
            value={`confidence ${formatPercent(cognition.introspection.confidence)} · diversity ${formatPercent(
              cognition.introspection.diversity
            )} · anomaly ${formatPercent(cognition.introspection.anomalyScore)}${
              cognition.introspection.intrusiveThoughtRisk ? " · risk flagged" : ""
            }`}
          />
          <FeedRow
            label="drives"
            value={
              topDrive
                ? `top ${topDrive.name} pressure ${formatPercent(topDrive.pressure)} · level ${formatPercent(topDrive.level)}`
                : "-"
            }
          />
          <FeedRow
            label="commitments"
            value={
              commitmentSummary
                ? `pending ${commitmentSummary.pending} · overdue ${commitmentSummary.overdue} · completed(12h) ${commitmentSummary.recentlyCompleted}`
                : "-"
            }
          />
          <FeedRow
            label="beliefs"
            value={
              beliefSummary
                ? `total ${beliefSummary.total} · conflicted ${beliefSummary.conflicted}`
                : "-"
            }
          />
          <FeedRow
            label="appraisal"
            value={
              appraisalSummary
                ? `${appraisalSummary.lastEmotionType} -> ${appraisalSummary.lastActionTendency} (agency ${appraisalSummary.lastAgency})`
                : "-"
            }
          />
          <FeedRow
            label="relationship"
            value={
              relationshipSummary
                ? `trust ${formatPercent(relationshipSummary.trust)} · consent ${formatPercent(
                    relationshipSummary.consentComfort
                  )} · risk ${formatPercent(relationshipSummary.dependenceRisk)} · rupture ${relationshipSummary.ruptureStatus}:${relationshipSummary.repairStage}`
                : "-"
            }
          />
          <FeedRow
            label="interiority"
            value={
              interioritySummary
                ? `${interioritySummary.activeConcernCount} active · top ${topInteriorityConcern?.title || "none"}${
                    topInteriorityConcern ? ` · pressure ${formatPercent(topInteriorityConcern.pressure)}` : ""
                  }`
                : "-"
            }
          />
          <FeedRow
            label="interiority.imprint"
            value={recentImprint ? `${formatTimestamp(recentImprint.at)} · ${recentImprint.meaning}` : "-"}
          />
          <FeedRow
            label="interaction.mode"
            value={
              interactionSummary
                ? `${interactionSummary.currentMode} — ${interactionSummary.currentReason}`
                : "-"
            }
          />
          <FeedRow
            label="memory.governance"
            value={
              governanceSummary
                ? `runs ${governanceSummary.runs} · consolidated ${governanceSummary.lastConsolidatedClusters} · pruned nodes ${governanceSummary.lastPrunedNodes} · pruned edges ${governanceSummary.lastPrunedEdges}`
                : "-"
            }
          />
          <FeedRow
            label="persona"
            value={
              personaSummary
                ? `policy ${personaSummary.policyVersion} · drift ${formatPercent(personaSummary.driftScore)} · regression ${formatTimestamp(
                    personaSummary.lastRegressionAt
                  )}`
                : "-"
            }
          />
        </dl>

        <div className="memory-updates">
          <h3>Vision Memory</h3>
          {worldGrounding ? (
            <ul>
              {worldGrounding.vision.disclosure.stored.slice(0, 3).map((item) => (
                <li key={`stored-${item}`}>stored: {item}</li>
              ))}
              {worldGrounding.vision.disclosure.discarded.slice(0, 3).map((item) => (
                <li key={`discarded-${item}`}>discarded: {item}</li>
              ))}
            </ul>
          ) : (
            <p>-</p>
          )}
          {worldGrounding && worldGrounding.vision.disclosure.stored.length === 0 && worldGrounding.vision.disclosure.discarded.length === 0 ? (
            <p>-</p>
          ) : null}
        </div>

        <div className="memory-updates">
          <h3>memoryUpdates</h3>
          {state.lastHeartbeat.memoryUpdates.length === 0 ? (
            <p>-</p>
          ) : (
            <ul>
              {state.lastHeartbeat.memoryUpdates.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="memory-updates">
          <h3>Autobiographical Narrative</h3>
          <ul>
            <li>{cognition.memory.narratives.micro || "-"}</li>
            <li>{cognition.memory.narratives.meso || "-"}</li>
            <li>{cognition.memory.narratives.macro || "-"}</li>
          </ul>
        </div>

        <div className="memory-updates">
          <h3>Working Memory</h3>
          {cognition.memory.working.items.length === 0 ? (
            <p>-</p>
          ) : (
            <ul>
              {cognition.memory.working.items.map((item) => (
                <li key={item.id}>
                  [{item.kind}] {item.summary} ({item.rehearsalCount} rehearsals, {formatPercent(item.salience)})
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="memory-updates">
          <h3>Recent Reflection Thoughts</h3>
          {cognition.reflection.recentThoughts.length === 0 ? (
            <p>-</p>
          ) : (
            <ul>
              {cognition.reflection.recentThoughts.map((thought, index) => (
                <li key={`${thought}-${index}`}>{thought}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="memory-updates">
          <h3>Commitment Ledger</h3>
          {commitmentSummary?.items?.length ? (
            <ul>
              {commitmentSummary.items.slice(0, 8).map((item) => (
                <li key={item.id}>
                  [{item.status}] {item.title}
                  {item.dueAt ? ` (due ${formatTimestamp(item.dueAt)})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>-</p>
          )}
        </div>

        <div className="memory-updates">
          <h3>Projects + Beliefs</h3>
          <ul>
            {(projectSummary?.items ?? []).slice(0, 4).map((project) => (
              <li key={project.id}>
                [{project.status}] {project.name} {"->"} {project.nextAction}
              </li>
            ))}
            {(beliefSummary?.items ?? []).slice(0, 4).map((belief) => (
              <li key={belief.id}>
                [{belief.status}] {belief.key}:{belief.condition} = {belief.value} ({formatPercent(belief.confidence)})
              </li>
            ))}
          </ul>
          {!projectSummary?.items?.length && !beliefSummary?.items?.length ? <p>-</p> : null}
        </div>

        <div className="memory-updates">
          <h3>Relationship + Mode History</h3>
          {relationshipSummary || interactionSummary ? (
            hasRelationshipOrModeHistory ? (
              <ul>
                {relationshipSummary?.topicSensitivity.slice(0, 4).map((topic) => (
                  <li key={`${topic.topic}-${topic.updatedAt}`}>
                    topic {topic.topic}: sensitivity {formatPercent(topic.score)}
                  </li>
                ))}
                {interactionSummary?.history.slice(-4).map((item) => (
                  <li key={`${item.at}-${item.mode}`}>
                    {formatTimestamp(item.at)}: {item.mode} ({item.reason})
                  </li>
                ))}
              </ul>
            ) : (
              <p>-</p>
            )
          ) : (
            <p>-</p>
          )}
        </div>

        <div className="memory-updates">
          <h3>Interiority</h3>
          {interioritySummary &&
          (interioritySummary.concerns.length > 0 || Boolean(recentImprint)) ? (
            <ul>
              {interioritySummary.concerns.slice(0, 2).map((concern) => (
                <li key={`${concern.partnerId}-${concern.kind}-${concern.updatedAt}`}>
                  [{concern.status}] {concern.title} ({formatPercent(concern.pressure)}) {"->"} {concern.summary}
                </li>
              ))}
              {recentImprint ? (
                <li key={`imprint-${recentImprint.at}`}>
                  imprint: {recentImprint.meaning}
                  {recentImprint.selfFacetDelta.length > 0 ? ` · ${recentImprint.selfFacetDelta.join(" · ")}` : ""}
                  {recentImprint.selfFacetDelta.length === 0 && recentImprint.concernDelta.length > 0
                    ? ` · ${recentImprint.concernDelta.join(" · ")}`
                    : ""}
                </li>
              ) : null}
            </ul>
          ) : (
            <p>-</p>
          )}
        </div>

        <div className="memory-updates">
          <h3>Memory Governance</h3>
          {governanceSummary ? (
            <ul>
              <li>last sleep: {formatTimestamp(governanceSummary.lastSleepAt)}</li>
              <li>reason: {governanceSummary.lastReason}</li>
              <li>summary: {governanceSummary.lastSummary}</li>
              <li>
                tiers: identity {governanceSummary.tierCounts.identityKernel}, relationship{" "}
                {governanceSummary.tierCounts.relationshipKernel}, commitments{" "}
                {governanceSummary.tierCounts.commitmentProject}, beliefs {governanceSummary.tierCounts.beliefAnchor},
                episodic {governanceSummary.tierCounts.episodic}, transient {governanceSummary.tierCounts.transient}
              </li>
            </ul>
          ) : (
            <p>-</p>
          )}
        </div>

        <div className="memory-updates">
          <h3>Social Models</h3>
          {cognition.social.agents.length === 0 ? (
            <p>-</p>
          ) : (
            <ul>
              {cognition.social.agents.map((agent) => (
                <li key={agent.id}>
                  {agent.displayName}: {agent.inferredBelief} (goal: {agent.inferredGoal})
                </li>
              ))}
            </ul>
          )}
          <p>Channels: {cognition.social.channels.join(", ") || "-"}</p>
        </div>

        <div className="continuity-meta">
          <p>Source: {state.sourcePath || "-"}</p>
          <p>
            Runtime: {cognition.runtimePath || "-"} · Event log: {cognition.eventLogPath || "-"}
          </p>
          <p>
            Compliance log: {cognition.complianceLogPath || "-"}
          </p>
          {!state.available && state.error ? <p className="continuity-error">Read error: {state.error}</p> : null}
        </div>
      </div>
    </aside>
  );
}
