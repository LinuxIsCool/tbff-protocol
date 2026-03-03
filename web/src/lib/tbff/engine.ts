/**
 * TBFF Engine — TypeScript reference implementation.
 *
 * Mirrors contracts/src/libraries/TBFFMath.sol.
 * Uses float64 (number) with dollar amounts.
 *
 * Core equation:
 *   x^(k+1) = min(x^(k), t) + P^T · max(0, x^(k) - t)
 */

// ─── Types ───────────────────────────────────────────────────

export interface Allocation {
  target: string; // participant ID
  weight: number; // 0–1 (1 = 100%)
}

export interface Participant {
  id: string;
  name: string;
  emoji: string;
  role: string;
  value: number; // dimensionally agnostic: balance ($) or income rate ($/second)
  minThreshold: number; // overflow gate: no redistribution if value < minThreshold
  maxThreshold: number; // used by the equation
  allocations: Allocation[];
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface IterationSnapshot {
  iteration: number;
  values: Record<string, number>;
  overflows: Record<string, number>;
  transfers: Transfer[];
  changed: boolean;
}

export interface ConvergenceResult {
  finalValues: Record<string, number>;
  iterations: number;
  converged: boolean;
  snapshots: IterationSnapshot[];
  totalRedistributed: number;
}

// ─── Pure Functions ──────────────────────────────────────────

const EPSILON = 1e-10; // floating-point comparison tolerance

export function capToThreshold(value: number, threshold: number): number {
  return Math.min(value, threshold);
}

export function computeOverflow(value: number, threshold: number): number {
  return Math.max(0, value - threshold);
}

/**
 * Distribute overflow according to weights.
 * Last recipient gets remainder for exact conservation (mirrors Solidity dust fix).
 * Weights MUST sum to 1.0 for conservation to hold.
 */
export function distributeOverflow(
  overflow: number,
  fromId: string,
  allocations: Allocation[]
): { amounts: Record<string, number>; transfers: Transfer[] } {
  const amounts: Record<string, number> = {};
  const transfers: Transfer[] = [];

  if (overflow <= 0 || allocations.length === 0) {
    return { amounts, transfers };
  }

  let distributed = 0;
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    let amount: number;

    if (i === allocations.length - 1) {
      // Last recipient gets remainder for exact conservation
      amount = overflow - distributed;
    } else {
      amount = overflow * alloc.weight;
      distributed += amount;
    }

    amounts[alloc.target] = (amounts[alloc.target] ?? 0) + amount;
    transfers.push({ from: fromId, to: alloc.target, amount });
  }

  return { amounts, transfers };
}

/**
 * Execute one full pass of the TBFF equation.
 */
export function iterateOnce(
  participants: Participant[],
  iterationNum: number
): { newValues: Record<string, number>; changed: boolean; snapshot: IterationSnapshot } {
  const newValues: Record<string, number> = {};
  const overflows: Record<string, number> = {};
  const transfers: Transfer[] = [];

  // Phase 1: Cap all values and compute overflow
  // Note: minThreshold gate is NOT applied here — it lives in the stream/display
  // layer only (mirrors Solidity: TBFFMath has no minThreshold, gate is in
  // _applyRedistribution). This preserves the Engine Mirror Pattern.
  for (const p of participants) {
    newValues[p.id] = capToThreshold(p.value, p.maxThreshold);
    overflows[p.id] = computeOverflow(p.value, p.maxThreshold);
  }

  // Phase 2: Distribute overflows
  for (const p of participants) {
    const overflow = overflows[p.id];
    if (overflow > EPSILON && p.allocations.length > 0) {
      const { amounts, transfers: t } = distributeOverflow(overflow, p.id, p.allocations);
      for (const [target, amount] of Object.entries(amounts)) {
        newValues[target] = (newValues[target] ?? 0) + amount;
      }
      transfers.push(...t);
    }
  }

  // Check if anything changed
  let changed = false;
  for (const p of participants) {
    if (Math.abs(newValues[p.id] - p.value) > EPSILON) {
      changed = true;
      break;
    }
  }

  return {
    newValues,
    changed,
    snapshot: {
      iteration: iterationNum,
      values: { ...newValues },
      overflows: { ...overflows },
      transfers,
      changed,
    },
  };
}

/**
 * Iterate the TBFF equation until convergence or maxIterations.
 */
export function converge(
  participants: Participant[],
  maxIterations: number = 50
): ConvergenceResult {
  const snapshots: IterationSnapshot[] = [];
  let totalRedistributed = 0;

  // Work on a mutable copy of participants
  let current = participants.map((p) => ({ ...p }));

  for (let iter = 1; iter <= maxIterations; iter++) {
    const { newValues, changed, snapshot } = iterateOnce(current, iter);
    snapshots.push(snapshot);

    // Sum redistribution
    for (const t of snapshot.transfers) {
      totalRedistributed += t.amount;
    }

    // Update current values for next iteration
    current = current.map((p) => ({
      ...p,
      value: newValues[p.id],
    }));

    if (!changed) {
      const finalValues: Record<string, number> = {};
      for (const p of current) {
        finalValues[p.id] = p.value;
      }
      return {
        finalValues,
        iterations: iter,
        converged: true,
        snapshots,
        totalRedistributed,
      };
    }
  }

  // Hit max iterations
  const finalValues: Record<string, number> = {};
  for (const p of current) {
    finalValues[p.id] = p.value;
  }
  return {
    finalValues,
    iterations: maxIterations,
    converged: false,
    snapshots,
    totalRedistributed,
  };
}
