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
  balance: number;
  minThreshold: number; // display only in Phase 1
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
  balances: Record<string, number>;
  overflows: Record<string, number>;
  transfers: Transfer[];
  changed: boolean;
}

export interface ConvergenceResult {
  finalBalances: Record<string, number>;
  iterations: number;
  converged: boolean;
  snapshots: IterationSnapshot[];
  totalRedistributed: number;
}

// ─── Pure Functions ──────────────────────────────────────────

const EPSILON = 1e-10; // floating-point comparison tolerance

export function capToThreshold(balance: number, threshold: number): number {
  return Math.min(balance, threshold);
}

export function computeOverflow(balance: number, threshold: number): number {
  return Math.max(0, balance - threshold);
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
): { newBalances: Record<string, number>; changed: boolean; snapshot: IterationSnapshot } {
  const newBalances: Record<string, number> = {};
  const overflows: Record<string, number> = {};
  const transfers: Transfer[] = [];

  // Phase 1: Cap all balances
  for (const p of participants) {
    newBalances[p.id] = capToThreshold(p.balance, p.maxThreshold);
    overflows[p.id] = computeOverflow(p.balance, p.maxThreshold);
  }

  // Phase 2: Distribute overflows
  for (const p of participants) {
    const overflow = overflows[p.id];
    if (overflow > EPSILON && p.allocations.length > 0) {
      const { amounts, transfers: t } = distributeOverflow(overflow, p.id, p.allocations);
      for (const [target, amount] of Object.entries(amounts)) {
        newBalances[target] = (newBalances[target] ?? 0) + amount;
      }
      transfers.push(...t);
    }
  }

  // Check if anything changed
  let changed = false;
  for (const p of participants) {
    if (Math.abs(newBalances[p.id] - p.balance) > EPSILON) {
      changed = true;
      break;
    }
  }

  return {
    newBalances,
    changed,
    snapshot: {
      iteration: iterationNum,
      balances: { ...newBalances },
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
    const { newBalances, changed, snapshot } = iterateOnce(current, iter);
    snapshots.push(snapshot);

    // Sum redistribution
    for (const t of snapshot.transfers) {
      totalRedistributed += t.amount;
    }

    // Update current balances for next iteration
    current = current.map((p) => ({
      ...p,
      balance: newBalances[p.id],
    }));

    if (!changed) {
      const finalBalances: Record<string, number> = {};
      for (const p of current) {
        finalBalances[p.id] = p.balance;
      }
      return {
        finalBalances,
        iterations: iter,
        converged: true,
        snapshots,
        totalRedistributed,
      };
    }
  }

  // Hit max iterations
  const finalBalances: Record<string, number> = {};
  for (const p of current) {
    finalBalances[p.id] = p.balance;
  }
  return {
    finalBalances,
    iterations: maxIterations,
    converged: false,
    snapshots,
    totalRedistributed,
  };
}
