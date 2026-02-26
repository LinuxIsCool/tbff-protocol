import { describe, it, expect } from "vitest";
import { converge, type Participant } from "../engine";

/**
 * Cross-validation tests: TypeScript vs Solidity known outputs.
 *
 * These hardcoded expected values come from the Solidity test output
 * (TBFFMath.t.sol). The tolerance is $0.01 per node as specified in the spec.
 */

function makeParticipants(
  configs: {
    id: string;
    balance: number;
    maxThreshold: number;
    allocations: { target: string; weight: number }[];
  }[]
): Participant[] {
  return configs.map((c) => ({
    ...c,
    name: c.id,
    emoji: "",
    role: "",
    minThreshold: 0,
  }));
}

describe("Cross-validation: TypeScript matches Solidity", () => {
  it("linear chain (A->B->C)", () => {
    // Solidity: test_threeNodeConvergence
    // Initial: [200e18, 50e18, 30e18], thresholds: [100e18, 100e18, 100e18]
    // A->B(100%), B->C(100%), C->none
    // Expected: [100, 100, 80], iterations: 3
    const participants = makeParticipants([
      { id: "a", balance: 200, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 50, maxThreshold: 100, allocations: [{ target: "c", weight: 1 }] },
      { id: "c", balance: 30, maxThreshold: 100, allocations: [] },
    ]);

    const result = converge(participants, 50);

    // Solidity outputs (converted from WAD to dollars)
    expect(result.finalBalances["a"]).toBeCloseTo(100, 2);
    expect(result.finalBalances["b"]).toBeCloseTo(100, 2);
    expect(result.finalBalances["c"]).toBeCloseTo(80, 2);
    expect(result.iterations).toBe(3);
    expect(result.converged).toBe(true);
  });

  it("circular allocation (A->B->C->A)", () => {
    // Solidity: test_circularAllocation
    // Initial: [150e18, 150e18, 150e18], thresholds: [100e18, 100e18, 100e18]
    // A->B(100%), B->C(100%), C->A(100%)
    // Expected: [150, 150, 150], iterations: 1 (fixed point)
    const participants = makeParticipants([
      { id: "a", balance: 150, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 150, maxThreshold: 100, allocations: [{ target: "c", weight: 1 }] },
      { id: "c", balance: 150, maxThreshold: 100, allocations: [{ target: "a", weight: 1 }] },
    ]);

    const result = converge(participants, 50);

    expect(result.finalBalances["a"]).toBeCloseTo(150, 2);
    expect(result.finalBalances["b"]).toBeCloseTo(150, 2);
    expect(result.finalBalances["c"]).toBeCloseTo(150, 2);
    expect(result.iterations).toBe(1);
    expect(result.converged).toBe(true);
  });

  it("diamond topology (A->B,C->D)", () => {
    // Manually computed for cross-validation:
    // A: balance=500, threshold=100, allocations: B(50%), C(50%)
    // B: balance=50, threshold=100, allocations: D(100%)
    // C: balance=50, threshold=100, allocations: D(100%)
    // D: balance=10, threshold=200, allocations: none
    //
    // Iter 1: A overflows 400 -> B gets 200, C gets 200
    //   A=100, B=250, C=250, D=10
    // Iter 2: B overflows 150 -> D gets 150. C overflows 150 -> D gets 150.
    //   A=100, B=100, C=100, D=310
    // Iter 3: D overflows 110 (no allocs) -> D capped at 200
    //   A=100, B=100, C=100, D=200 (110 lost, no allocs)
    //   Wait, D has no allocs so overflow is lost.
    // Actually, D overflow = 310-200 = 110, but D has no allocations.
    //   So D = min(310, 200) = 200. Overflow = 110, goes nowhere.
    //   A=100, B=100, C=100, D=200. No change next iter -> converged.
    //
    // Total initial: 610. Total final: 500. Lost: 110 (D's unallocated overflow).
    const participants = makeParticipants([
      {
        id: "a", balance: 500, maxThreshold: 100,
        allocations: [{ target: "b", weight: 0.5 }, { target: "c", weight: 0.5 }],
      },
      { id: "b", balance: 50, maxThreshold: 100, allocations: [{ target: "d", weight: 1 }] },
      { id: "c", balance: 50, maxThreshold: 100, allocations: [{ target: "d", weight: 1 }] },
      { id: "d", balance: 10, maxThreshold: 200, allocations: [] },
    ]);

    const result = converge(participants, 50);

    expect(result.finalBalances["a"]).toBeCloseTo(100, 2);
    expect(result.finalBalances["b"]).toBeCloseTo(100, 2);
    expect(result.finalBalances["c"]).toBeCloseTo(100, 2);
    expect(result.finalBalances["d"]).toBeCloseTo(200, 2);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(4);
  });
});
