/**
 * Simulation domain types.
 *
 * These types extend the core TBFF engine types with temporal (monthly)
 * and visual (color, graph layout) concerns. The simulation engine
 * converts SimParticipant → Participant before calling converge().
 */

// ─── Funding ────────────────────────────────────────────────

export interface FundingStream {
  id: string;
  targetId: string; // participant who receives funds ("*" = everyone)
  amountPerMonth: number; // USD per month
  startMonth: string; // "2026-01"
  endMonth: string; // "2028-01" (exclusive)
}

// ─── Participants ───────────────────────────────────────────

export interface SimAllocation {
  target: string;
  weight: number; // 0–1
}

export interface SimParticipant {
  id: string;
  name: string;
  emoji: string;
  role: string;
  color: string; // HSL from node-colors palette
  initialBalance: number;
  minThreshold: number; // lockup floor
  maxThreshold: number; // overflow ceiling
  allocations: SimAllocation[];
}

// ─── Monthly State ──────────────────────────────────────────

export interface MonthlyNodeState {
  balance: number;
  balanceBeforeConvergence: number; // after funding, before converge
  overflow: number;
  flowedIn: number; // $ received from other nodes this month
  flowedOut: number; // $ sent to other nodes this month
  isLocked: boolean; // balance < minThreshold
  cumulativeFlowThrough: number; // total $ that has flowed through this node
}

export interface MonthlyTransfer {
  from: string;
  to: string;
  amount: number;
}

export interface MonthlySnapshot {
  month: string; // "2026-01"
  monthIndex: number;
  nodeStates: Record<string, MonthlyNodeState>;
  transfers: MonthlyTransfer[];
  convergenceIterations: number;
  totalRedistributed: number;
}

export interface SimulationResult {
  snapshots: MonthlySnapshot[];
  participants: SimParticipant[];
  startMonth: string;
  endMonth: string;
  monthCount: number;
}

// ─── Graph Rendering ────────────────────────────────────────

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  fillRadius: number;
  borderWidth: number;
  fillAlpha: number;
  borderAlpha: number;
  color: string;
  isLocked: boolean;
  label: string;
  emoji: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  width: number;
  fillAlpha: number; // cumulative flow encoding
  strokeAlpha: number; // monthly flow encoding
  color: string;
}
