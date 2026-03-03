import { describe, it, expect } from "vitest";
import { normalizeWeights, validateAllocations } from "../allocation-utils";
import { converge, type Participant } from "../engine";

// ─── normalizeWeights ───────────────────────────────────────

describe("normalizeWeights", () => {
  it("normalizes weights to sum to 1.0", () => {
    const result = normalizeWeights([
      { target: "a", weight: 0.3 },
      { target: "b", weight: 0.7 },
    ]);
    const sum = result.reduce((s, a) => s + a.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-10);
  });

  it("handles all-zero weights with equal distribution", () => {
    const result = normalizeWeights([
      { target: "a", weight: 0 },
      { target: "b", weight: 0 },
      { target: "c", weight: 0 },
    ]);
    const sum = result.reduce((s, a) => s + a.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-10);
    // Each should be ~1/3
    for (const a of result) {
      expect(a.weight).toBeCloseTo(1 / 3, 5);
    }
  });

  it("handles single allocation", () => {
    const result = normalizeWeights([{ target: "a", weight: 0.5 }]);
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(1.0);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeWeights([])).toHaveLength(0);
  });

  it("preserves relative proportions", () => {
    const result = normalizeWeights([
      { target: "a", weight: 0.2 },
      { target: "b", weight: 0.8 },
    ]);
    // b should be 4x a
    expect(result[1].weight / result[0].weight).toBeCloseTo(4, 5);
  });

  it("normalizes weights that exceed 1.0", () => {
    const result = normalizeWeights([
      { target: "a", weight: 0.6 },
      { target: "b", weight: 0.8 },
    ]);
    const sum = result.reduce((s, a) => s + a.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-10);
  });
});

// ─── validateAllocations ────────────────────────────────────

describe("validateAllocations", () => {
  const allIds = ["shawn", "jeff", "darren", "simon", "christina"];

  it("catches self-allocation", () => {
    const result = validateAllocations(
      [{ target: "shawn", weight: 1.0 }],
      "shawn",
      allIds
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Cannot allocate to self");
  });

  it("catches duplicate targets", () => {
    const result = validateAllocations(
      [
        { target: "jeff", weight: 0.5 },
        { target: "jeff", weight: 0.5 },
      ],
      "shawn",
      allIds
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate allocation targets");
  });

  it("catches unknown targets", () => {
    const result = validateAllocations(
      [{ target: "unknown", weight: 1.0 }],
      "shawn",
      allIds
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Unknown target: unknown");
  });

  it("accepts valid allocations", () => {
    const result = validateAllocations(
      [
        { target: "jeff", weight: 0.5 },
        { target: "darren", weight: 0.5 },
      ],
      "shawn",
      allIds
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── Engine integration ─────────────────────────────────────

describe("Normalized allocations preserve conservation in engine", () => {
  it("normalized weights produce exact conservation", () => {
    const normalized = normalizeWeights([
      { target: "b", weight: 0.33 },
      { target: "c", weight: 0.67 },
    ]);

    const participants: Participant[] = [
      {
        id: "a", name: "A", emoji: "", role: "",
        value: 200, minThreshold: 0, maxThreshold: 100,
        allocations: normalized,
      },
      {
        id: "b", name: "B", emoji: "", role: "",
        value: 50, minThreshold: 0, maxThreshold: 100,
        allocations: [{ target: "c", weight: 1 }],
      },
      {
        id: "c", name: "C", emoji: "", role: "",
        value: 30, minThreshold: 0, maxThreshold: 100,
        allocations: [],
      },
    ];

    const initialSum = participants.reduce((s, p) => s + p.value, 0);
    const result = converge(participants);
    const finalSum = Object.values(result.finalValues).reduce((a, b) => a + b, 0);

    expect(Math.abs(finalSum - initialSum)).toBeLessThan(0.01);
  });
});

describe("Empty allocations don't break engine", () => {
  it("handles participant with no allocations", () => {
    const participants: Participant[] = [
      {
        id: "a", name: "A", emoji: "", role: "",
        value: 200, minThreshold: 0, maxThreshold: 100,
        allocations: [],
      },
    ];

    const result = converge(participants);
    // Balance capped at threshold, overflow lost
    expect(result.finalValues["a"]).toBe(100);
    expect(result.converged).toBe(true);
  });
});
