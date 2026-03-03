/**
 * Pure functions that derive visual properties from simulation state.
 * No D3 dependency — just math.
 */

import type {
  SimParticipant,
  MonthlyNodeState,
  GraphNode,
  GraphEdge,
} from "./types";

// ─── Node Geometry ──────────────────────────────────────────

const MIN_FILL_RADIUS = 18;
const MAX_FILL_RADIUS = 52;
const MIN_BORDER_WIDTH = 2;
const MAX_BORDER_WIDTH = 8;

/** Linear interpolation between min and max. Clamps to [0, 1]. */
function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * Math.max(0, Math.min(1, t));
}

/** Compute visual properties for a node from its simulation state. */
export function computeNodeGeometry(
  participant: SimParticipant,
  state: MonthlyNodeState,
  allMinThresholds: number[],
  allMaxThresholds: number[]
): GraphNode {
  const minRange = Math.max(...allMinThresholds) - Math.min(...allMinThresholds);
  const maxRange = Math.max(...allMaxThresholds) - Math.min(...allMaxThresholds);

  // Normalize thresholds across participants for radius/border scaling
  const minNorm =
    minRange > 0
      ? (participant.minThreshold - Math.min(...allMinThresholds)) / minRange
      : 0.5;
  const maxNorm =
    maxRange > 0
      ? (participant.maxThreshold - Math.min(...allMaxThresholds)) / maxRange
      : 0.5;

  const fillAlpha =
    participant.minThreshold > 0
      ? Math.min(1, state.balance / participant.minThreshold)
      : 1;

  const borderAlpha =
    participant.maxThreshold > 0
      ? Math.min(1, state.balance / participant.maxThreshold)
      : 1;

  return {
    id: participant.id,
    x: 0, // set by force simulation
    y: 0,
    fillRadius: lerp(MIN_FILL_RADIUS, MAX_FILL_RADIUS, minNorm),
    borderWidth: lerp(MIN_BORDER_WIDTH, MAX_BORDER_WIDTH, maxNorm),
    fillAlpha,
    borderAlpha,
    color: participant.color,
    isLocked: state.isLocked,
    label: participant.name,
    emoji: participant.emoji,
  };
}

// ─── Edge Geometry ──────────────────────────────────────────

const MIN_EDGE_WIDTH = 1;
const MAX_EDGE_WIDTH = 5;

/** Compute visual properties for an edge. */
export function computeEdgeGeometry(
  sourceId: string,
  targetId: string,
  weight: number,
  monthlyFlow: number,
  cumulativeFlow: number,
  maxMonthlyFlow: number,
  maxCumulativeFlow: number,
  sourceColor: string
): GraphEdge {
  const fillAlpha =
    maxCumulativeFlow > 0
      ? Math.min(1, cumulativeFlow / maxCumulativeFlow) * 0.8 + 0.1
      : 0.1;

  const strokeAlpha =
    maxMonthlyFlow > 0
      ? Math.min(1, monthlyFlow / maxMonthlyFlow) * 0.8 + 0.1
      : 0.1;

  return {
    source: sourceId,
    target: targetId,
    width: lerp(MIN_EDGE_WIDTH, MAX_EDGE_WIDTH, weight),
    fillAlpha,
    strokeAlpha,
    color: sourceColor,
  };
}
