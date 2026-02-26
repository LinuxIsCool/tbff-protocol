import type { Allocation } from "./engine";

/**
 * Normalize allocation weights to sum to exactly 1.0.
 * Handles zeros, single allocations, and empty arrays.
 * Last recipient gets remainder for exact sum.
 */
export function normalizeWeights(allocations: Allocation[]): Allocation[] {
  if (allocations.length === 0) return [];
  if (allocations.length === 1) {
    return [{ ...allocations[0], weight: 1.0 }];
  }

  const sum = allocations.reduce((s, a) => s + a.weight, 0);

  if (sum === 0) {
    // Equal distribution when all weights are zero
    const equalWeight = 1.0 / allocations.length;
    return allocations.map((a, i) => ({
      ...a,
      weight: i === allocations.length - 1
        ? 1.0 - equalWeight * (allocations.length - 1)
        : equalWeight,
    }));
  }

  let distributed = 0;
  return allocations.map((a, i) => {
    if (i === allocations.length - 1) {
      // Last gets remainder for exact 1.0 sum
      return { ...a, weight: 1.0 - distributed };
    }
    const normalized = a.weight / sum;
    distributed += normalized;
    return { ...a, weight: normalized };
  });
}

/**
 * Validate allocations for a given participant.
 * Returns errors if:
 * - Self-allocation detected
 * - Duplicate targets
 * - Targets not in the network
 */
export function validateAllocations(
  allocations: Allocation[],
  participantId: string,
  allIds: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const a of allocations) {
    if (a.target === participantId) {
      errors.push("Cannot allocate to self");
    }
    if (!allIds.includes(a.target)) {
      errors.push(`Unknown target: ${a.target}`);
    }
  }

  const targets = allocations.map((a) => a.target);
  const uniqueTargets = new Set(targets);
  if (uniqueTargets.size < targets.length) {
    errors.push("Duplicate allocation targets");
  }

  return { valid: errors.length === 0, errors };
}
