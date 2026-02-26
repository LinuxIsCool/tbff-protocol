import { describe, it, expect } from "vitest";
import {
  capToThreshold,
  computeOverflow,
  converge,
  type Participant,
} from "../engine";

// ─── Helpers ─────────────────────────────────────────────────

function sumBalances(balances: Record<string, number>): number {
  return Object.values(balances).reduce((a, b) => a + b, 0);
}

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

// ─── Unit Tests ──────────────────────────────────────────────

describe("capToThreshold", () => {
  it("caps above threshold", () => {
    expect(capToThreshold(150, 100)).toBe(100);
  });

  it("passes through below threshold", () => {
    expect(capToThreshold(50, 100)).toBe(50);
  });

  it("passes through at threshold", () => {
    expect(capToThreshold(100, 100)).toBe(100);
  });
});

describe("computeOverflow", () => {
  it("computes overflow above threshold", () => {
    expect(computeOverflow(150, 100)).toBe(50);
  });

  it("returns 0 below threshold", () => {
    expect(computeOverflow(50, 100)).toBe(0);
  });

  it("returns 0 at threshold", () => {
    expect(computeOverflow(100, 100)).toBe(0);
  });
});

// ─── Integration Tests ───────────────────────────────────────

describe("converge", () => {
  it("underfunded scenario: no redistribution needed", () => {
    const participants = makeParticipants([
      { id: "a", balance: 50, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 70, maxThreshold: 100, allocations: [{ target: "a", weight: 1 }] },
    ]);

    const result = converge(participants);

    expect(result.finalBalances["a"]).toBe(50);
    expect(result.finalBalances["b"]).toBe(70);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("exact funding: zero overflow", () => {
    const participants = makeParticipants([
      { id: "a", balance: 100, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 100, maxThreshold: 100, allocations: [{ target: "a", weight: 1 }] },
    ]);

    const result = converge(participants);

    expect(result.finalBalances["a"]).toBe(100);
    expect(result.finalBalances["b"]).toBe(100);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("overfunded linear chain: A->B->C", () => {
    const participants = makeParticipants([
      { id: "a", balance: 200, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 50, maxThreshold: 100, allocations: [{ target: "c", weight: 1 }] },
      { id: "c", balance: 30, maxThreshold: 100, allocations: [] },
    ]);

    const result = converge(participants);

    expect(result.finalBalances["a"]).toBe(100);
    expect(result.finalBalances["b"]).toBe(100);
    expect(result.finalBalances["c"]).toBe(80);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(3);

    // Conservation
    expect(sumBalances(result.finalBalances)).toBeCloseTo(280, 2);
  });

  it("circular allocations: A->B->C->A converges", () => {
    const participants = makeParticipants([
      { id: "a", balance: 150, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 150, maxThreshold: 100, allocations: [{ target: "c", weight: 1 }] },
      { id: "c", balance: 150, maxThreshold: 100, allocations: [{ target: "a", weight: 1 }] },
    ]);

    const result = converge(participants);

    // Circular: overflow recirculates, reaches fixed point in 1 iteration
    expect(result.finalBalances["a"]).toBeCloseTo(150, 2);
    expect(result.finalBalances["b"]).toBeCloseTo(150, 2);
    expect(result.finalBalances["c"]).toBeCloseTo(150, 2);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);

    // Conservation
    expect(sumBalances(result.finalBalances)).toBeCloseTo(450, 2);
  });

  it("self-allocation: funds don't multiply", () => {
    const participants = makeParticipants([
      { id: "a", balance: 200, maxThreshold: 100, allocations: [{ target: "a", weight: 1 }] },
    ]);

    const result = converge(participants);

    expect(result.finalBalances["a"]).toBeCloseTo(200, 2);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("conservation of funds for mock data", () => {
    // All nodes must have allocations for conservation to hold
    const participants = makeParticipants([
      {
        id: "a", balance: 300, maxThreshold: 100,
        allocations: [{ target: "b", weight: 0.5 }, { target: "c", weight: 0.5 }],
      },
      {
        id: "b", balance: 200, maxThreshold: 150,
        allocations: [{ target: "c", weight: 0.7 }, { target: "d", weight: 0.3 }],
      },
      {
        id: "c", balance: 50, maxThreshold: 100,
        allocations: [{ target: "d", weight: 1 }],
      },
      {
        id: "d", balance: 10, maxThreshold: 80,
        allocations: [{ target: "a", weight: 0.5 }, { target: "b", weight: 0.5 }],
      },
    ]);

    const initialSum = participants.reduce((s, p) => s + p.balance, 0);
    const result = converge(participants);
    const finalSum = sumBalances(result.finalBalances);

    // Conservation: within $0.01
    expect(Math.abs(finalSum - initialSum)).toBeLessThan(0.01);
  });

  it("all below threshold after convergence (linear topology)", () => {
    const participants = makeParticipants([
      { id: "a", balance: 200, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 50, maxThreshold: 100, allocations: [{ target: "c", weight: 1 }] },
      { id: "c", balance: 30, maxThreshold: 100, allocations: [] },
    ]);

    const result = converge(participants);

    // In a linear (non-circular) topology, all final balances <= threshold
    for (const p of participants) {
      expect(result.finalBalances[p.id]).toBeLessThanOrEqual(p.maxThreshold + 0.01);
    }
  });

  it("convergence within 50 iterations", () => {
    // Diamond topology: A -> B,C -> D
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

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(50);
  });

  it("empty network: returns empty result", () => {
    const result = converge([]);

    expect(Object.keys(result.finalBalances)).toHaveLength(0);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("single participant with no allocations", () => {
    const participants = makeParticipants([
      { id: "a", balance: 500, maxThreshold: 100, allocations: [] },
    ]);

    const result = converge(participants);

    // Capped at threshold, overflow lost (no allocations)
    expect(result.finalBalances["a"]).toBe(100);
    expect(result.converged).toBe(true);
  });

  it("matches Solidity known outputs: linear chain", () => {
    // Same scenario as test_threeNodeConvergence in Solidity
    const participants = makeParticipants([
      { id: "a", balance: 200, maxThreshold: 100, allocations: [{ target: "b", weight: 1 }] },
      { id: "b", balance: 50, maxThreshold: 100, allocations: [{ target: "c", weight: 1 }] },
      { id: "c", balance: 30, maxThreshold: 100, allocations: [] },
    ]);

    const result = converge(participants, 50);

    // These values match the Solidity test exactly
    expect(result.finalBalances["a"]).toBe(100);
    expect(result.finalBalances["b"]).toBe(100);
    expect(result.finalBalances["c"]).toBe(80);
    expect(result.iterations).toBe(3);
  });
});
