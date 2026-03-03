import { describe, it, expect } from "vitest";
import { runMonthlySimulation, computeCumulativeTransfers } from "../simulation-engine";
import type { SimParticipant, FundingStream } from "../types";

function makeParticipant(overrides: Partial<SimParticipant> & { id: string }): SimParticipant {
  return {
    name: overrides.id,
    emoji: "🔵",
    role: "Test",
    color: "hsl(200, 70%, 50%)",
    initialBalance: 0,
    minThreshold: 1000,
    maxThreshold: 5000,
    allocations: [],
    ...overrides,
  };
}

describe("runMonthlySimulation", () => {
  const alice = makeParticipant({
    id: "alice",
    initialBalance: 3000,
    minThreshold: 1000,
    maxThreshold: 5000,
    allocations: [{ target: "bob", weight: 1.0 }],
  });

  const bob = makeParticipant({
    id: "bob",
    initialBalance: 2000,
    minThreshold: 1000,
    maxThreshold: 5000,
    allocations: [{ target: "alice", weight: 1.0 }],
  });

  it("produces correct number of snapshots", () => {
    const result = runMonthlySimulation([alice, bob], [], "2026-01", "2028-01");
    expect(result.snapshots).toHaveLength(24);
    expect(result.monthCount).toBe(24);
  });

  it("preserves total value with no funding streams", () => {
    const result = runMonthlySimulation([alice, bob], [], "2026-01", "2026-04");
    const totalInitial = alice.initialBalance + bob.initialBalance;

    for (const snap of result.snapshots) {
      const totalBalance = Object.values(snap.nodeStates).reduce(
        (sum, ns) => sum + ns.balance,
        0
      );
      expect(totalBalance).toBeCloseTo(totalInitial, 2);
    }
  });

  it("increases target balance with funding stream", () => {
    const stream: FundingStream = {
      id: "fund-alice",
      targetId: "alice",
      amountPerMonth: 500,
      startMonth: "2026-01",
      endMonth: "2026-04",
    };

    const result = runMonthlySimulation([alice, bob], [stream], "2026-01", "2026-04");

    // After 3 months of $500 each, total should increase by $1500
    const initialTotal = alice.initialBalance + bob.initialBalance;
    const finalSnap = result.snapshots[2];
    const finalTotal = Object.values(finalSnap.nodeStates).reduce(
      (sum, ns) => sum + ns.balance,
      0
    );
    expect(finalTotal).toBeCloseTo(initialTotal + 1500, 2);
  });

  it("lockup: underfunded node does not emit overflow", () => {
    const poor = makeParticipant({
      id: "poor",
      initialBalance: 500, // well below min of 1000
      minThreshold: 1000,
      maxThreshold: 5000,
      allocations: [{ target: "rich", weight: 1.0 }],
    });

    const rich = makeParticipant({
      id: "rich",
      initialBalance: 8000, // above max of 5000
      minThreshold: 1000,
      maxThreshold: 5000,
      allocations: [{ target: "poor", weight: 1.0 }],
    });

    const result = runMonthlySimulation([poor, rich], [], "2026-01", "2026-02");
    const snap = result.snapshots[0];

    // Poor should not have flowed out (locked)
    expect(snap.nodeStates["poor"].flowedOut).toBe(0);
    // Rich overflows to poor
    expect(snap.nodeStates["rich"].flowedOut).toBeGreaterThan(0);
    expect(snap.nodeStates["poor"].flowedIn).toBeGreaterThan(0);
  });

  it("lockup release: node meets min then overflows next month", () => {
    const locked = makeParticipant({
      id: "locked",
      initialBalance: 500,
      minThreshold: 2000,
      maxThreshold: 3000,
      allocations: [{ target: "sink", weight: 1.0 }],
    });

    const sink = makeParticipant({
      id: "sink",
      initialBalance: 0,
      minThreshold: 0,
      maxThreshold: 10000,
      allocations: [],
    });

    // Fund locked with $1000/month — should reach min by month 2
    const stream: FundingStream = {
      id: "fund-locked",
      targetId: "locked",
      amountPerMonth: 1000,
      startMonth: "2026-01",
      endMonth: "2026-06",
    };

    const result = runMonthlySimulation(
      [locked, sink],
      [stream],
      "2026-01",
      "2026-06"
    );

    // Month 0: balance = 500 + 1000 = 1500. Still < min (2000). Locked.
    expect(result.snapshots[0].nodeStates["locked"].isLocked).toBe(true);
    expect(result.snapshots[0].nodeStates["locked"].flowedOut).toBe(0);

    // Month 1: balance = 1500 + 1000 = 2500. >= min (2000). Lockup released.
    // But 2500 < max (3000), so no overflow yet.
    expect(result.snapshots[1].nodeStates["locked"].isLocked).toBe(false);

    // Month 3+: balance should exceed max (3000) and overflow
    // By month 2: prev was ~2500 + 1000 = 3500 > 3000, should overflow
    expect(result.snapshots[2].nodeStates["locked"].flowedOut).toBeGreaterThan(0);
  });

  it("everyone funding stream distributes evenly", () => {
    const a = makeParticipant({ id: "a", initialBalance: 0 });
    const b = makeParticipant({ id: "b", initialBalance: 0 });

    const stream: FundingStream = {
      id: "fund-all",
      targetId: "*",
      amountPerMonth: 1000,
      startMonth: "2026-01",
      endMonth: "2026-02",
    };

    const result = runMonthlySimulation([a, b], [stream], "2026-01", "2026-02");
    const snap = result.snapshots[0];

    // Each should get $500
    expect(snap.nodeStates["a"].balance).toBeCloseTo(500, 2);
    expect(snap.nodeStates["b"].balance).toBeCloseTo(500, 2);
  });
});

describe("computeCumulativeTransfers", () => {
  it("accumulates transfers across months", () => {
    const result = runMonthlySimulation(
      [
        {
          id: "a",
          name: "A",
          emoji: "🔵",
          role: "Test",
          color: "hsl(200, 70%, 50%)",
          initialBalance: 10000,
          minThreshold: 1000,
          maxThreshold: 5000,
          allocations: [{ target: "b", weight: 1.0 }],
        },
        {
          id: "b",
          name: "B",
          emoji: "🔴",
          role: "Test",
          color: "hsl(0, 70%, 50%)",
          initialBalance: 0,
          minThreshold: 0,
          maxThreshold: 10000,
          allocations: [],
        },
      ],
      [],
      "2026-01",
      "2026-03"
    );

    const cumMonth0 = computeCumulativeTransfers(result.snapshots, 0);
    const cumMonth1 = computeCumulativeTransfers(result.snapshots, 1);

    // Cumulative at month 1 should be >= month 0
    const m0Total = cumMonth0["a"]?.["b"] ?? 0;
    const m1Total = cumMonth1["a"]?.["b"] ?? 0;
    expect(m1Total).toBeGreaterThanOrEqual(m0Total);
  });
});
