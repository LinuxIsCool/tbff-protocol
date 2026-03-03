import { describe, it, expect } from "vitest";
import { generateMonthKeys, monthLabel, monthKeyToIndex } from "../months";

describe("generateMonthKeys", () => {
  it("generates correct range", () => {
    const keys = generateMonthKeys("2026-01", "2026-04");
    expect(keys).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("crosses year boundary", () => {
    const keys = generateMonthKeys("2026-11", "2027-02");
    expect(keys).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("returns empty for same start and end", () => {
    expect(generateMonthKeys("2026-01", "2026-01")).toEqual([]);
  });

  it("generates 24 months for 2-year span", () => {
    const keys = generateMonthKeys("2026-01", "2028-01");
    expect(keys).toHaveLength(24);
    expect(keys[0]).toBe("2026-01");
    expect(keys[23]).toBe("2027-12");
  });
});

describe("monthLabel", () => {
  it("formats correctly", () => {
    expect(monthLabel("2026-01")).toBe("Jan 2026");
    expect(monthLabel("2026-12")).toBe("Dec 2026");
  });
});

describe("monthKeyToIndex", () => {
  it("returns 0 for same month", () => {
    expect(monthKeyToIndex("2026-01", "2026-01")).toBe(0);
  });

  it("returns correct offset", () => {
    expect(monthKeyToIndex("2026-03", "2026-01")).toBe(2);
  });

  it("crosses year boundary", () => {
    expect(monthKeyToIndex("2027-01", "2026-01")).toBe(12);
  });
});
