/**
 * Monthly convergence simulation.
 *
 * Wraps the core TBFF converge() function with:
 * 1. Temporal model — iterates month-by-month
 * 2. Funding streams — external $ inflows per month
 * 3. minThreshold lockup — underfunded nodes absorb, don't overflow
 *
 * The core engine (engine.ts) is never modified.
 */

import type { Participant } from "@/lib/tbff/engine";
import { converge } from "@/lib/tbff/engine";
import type {
  SimParticipant,
  FundingStream,
  MonthlySnapshot,
  MonthlyNodeState,
  MonthlyTransfer,
  SimulationResult,
} from "./types";
import { generateMonthKeys } from "./months";

// ─── Lockup Logic ───────────────────────────────────────────

/**
 * Determine effective maxThreshold under lockup rules.
 *
 * If lockup is not yet satisfied (balance hasn't met minThreshold),
 * the node absorbs all funds — effective max = balance (zero overflow).
 * Once min is met, normal maxThreshold applies.
 */
function effectiveMaxThreshold(
  maxThreshold: number,
  lockupSatisfied: boolean
): number {
  if (lockupSatisfied) return maxThreshold;
  // In lockup: absorb all inflows, never overflow
  return Number.MAX_SAFE_INTEGER;
}

// ─── Funding Application ────────────────────────────────────

function applyFundingStreams(
  balances: Record<string, number>,
  streams: FundingStream[],
  month: string,
  participantIds: string[]
): Record<string, number> {
  const result = { ...balances };

  for (const stream of streams) {
    if (month < stream.startMonth || month >= stream.endMonth) continue;

    if (stream.targetId === "*") {
      // Distribute evenly to all participants
      const perPerson = stream.amountPerMonth / participantIds.length;
      for (const id of participantIds) {
        result[id] = (result[id] ?? 0) + perPerson;
      }
    } else {
      result[stream.targetId] =
        (result[stream.targetId] ?? 0) + stream.amountPerMonth;
    }
  }

  return result;
}

// ─── Conversion ─────────────────────────────────────────────

function toEngineParticipants(
  simParticipants: SimParticipant[],
  balances: Record<string, number>,
  lockupSatisfied: Record<string, boolean>
): Participant[] {
  return simParticipants.map((sp) => ({
    id: sp.id,
    name: sp.name,
    emoji: sp.emoji,
    role: sp.role,
    balance: balances[sp.id] ?? 0,
    minThreshold: sp.minThreshold,
    maxThreshold: effectiveMaxThreshold(
      sp.maxThreshold,
      lockupSatisfied[sp.id] ?? false
    ),
    allocations: sp.allocations,
  }));
}

// ─── Cumulative Transfer Computation ────────────────────────

/**
 * Compute cumulative transfers up to (and including) the given month index.
 * Returns nested map: cumulativeTransfers[fromId][toId] = total $.
 */
export function computeCumulativeTransfers(
  snapshots: MonthlySnapshot[],
  upToIndex: number
): Record<string, Record<string, number>> {
  const cumulative: Record<string, Record<string, number>> = {};

  for (let i = 0; i <= Math.min(upToIndex, snapshots.length - 1); i++) {
    for (const t of snapshots[i].transfers) {
      if (!cumulative[t.from]) cumulative[t.from] = {};
      cumulative[t.from][t.to] =
        (cumulative[t.from][t.to] ?? 0) + t.amount;
    }
  }

  return cumulative;
}

// ─── Main Simulation ────────────────────────────────────────

export function runMonthlySimulation(
  participants: SimParticipant[],
  fundingStreams: FundingStream[],
  startMonth: string,
  endMonth: string
): SimulationResult {
  const monthKeys = generateMonthKeys(startMonth, endMonth);
  const participantIds = participants.map((p) => p.id);

  // Initialize balances and lockup state
  const balances: Record<string, number> = {};
  const lockupSatisfied: Record<string, boolean> = {};
  const cumulativeFlowThrough: Record<string, number> = {};

  for (const p of participants) {
    balances[p.id] = p.initialBalance;
    lockupSatisfied[p.id] = p.initialBalance >= p.minThreshold;
    cumulativeFlowThrough[p.id] = 0;
  }

  const snapshots: MonthlySnapshot[] = [];

  for (let mi = 0; mi < monthKeys.length; mi++) {
    const month = monthKeys[mi];

    // 1. Apply funding streams
    const fundedBalances = applyFundingStreams(
      balances,
      fundingStreams,
      month,
      participantIds
    );

    // 2. Build engine participants with lockup-adjusted thresholds
    const engineParticipants = toEngineParticipants(
      participants,
      fundedBalances,
      lockupSatisfied
    );

    // 3. Run convergence (engine is not modified)
    const result = converge(engineParticipants);

    // 4. Extract transfers and compute per-node state
    const nodeStates: Record<string, MonthlyNodeState> = {};
    const transfers: MonthlyTransfer[] = [];

    // Aggregate transfers from all convergence iterations
    const flowIn: Record<string, number> = {};
    const flowOut: Record<string, number> = {};

    for (const snap of result.snapshots) {
      for (const t of snap.transfers) {
        flowIn[t.to] = (flowIn[t.to] ?? 0) + t.amount;
        flowOut[t.from] = (flowOut[t.from] ?? 0) + t.amount;
        transfers.push({ from: t.from, to: t.to, amount: t.amount });
      }
    }

    for (const p of participants) {
      const finalBalance = result.finalBalances[p.id] ?? 0;
      const inFlow = flowIn[p.id] ?? 0;
      const outFlow = flowOut[p.id] ?? 0;
      cumulativeFlowThrough[p.id] += inFlow + outFlow;

      nodeStates[p.id] = {
        balance: finalBalance,
        balanceBeforeConvergence: fundedBalances[p.id] ?? 0,
        overflow: Math.max(0, (fundedBalances[p.id] ?? 0) - p.maxThreshold),
        flowedIn: inFlow,
        flowedOut: outFlow,
        isLocked: finalBalance < p.minThreshold,
        cumulativeFlowThrough: cumulativeFlowThrough[p.id],
      };
    }

    snapshots.push({
      month,
      monthIndex: mi,
      nodeStates,
      transfers,
      convergenceIterations: result.iterations,
      totalRedistributed: result.totalRedistributed,
    });

    // 5. Update balances and lockup state for next month
    for (const p of participants) {
      balances[p.id] = result.finalBalances[p.id] ?? 0;
      if (balances[p.id] >= p.minThreshold) {
        lockupSatisfied[p.id] = true;
      } else {
        lockupSatisfied[p.id] = false;
      }
    }
  }

  return {
    snapshots,
    participants,
    startMonth,
    endMonth,
    monthCount: monthKeys.length,
  };
}
