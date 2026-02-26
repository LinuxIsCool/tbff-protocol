import type { Participant } from "./engine";

/**
 * 8 participants with realistic cross-allocations.
 * Sum of minimums: $24,800/mo
 * Sum of maximums: $53,000/mo
 */
export const mockParticipants: Participant[] = [
  {
    id: "ygg",
    name: "Ygg",
    emoji: "\u{1F332}",
    role: "AI Infrastructure",
    balance: 8000,
    minThreshold: 3000,
    maxThreshold: 6000,
    allocations: [
      { target: "eve", weight: 0.3 },
      { target: "artem", weight: 0.4 },
      { target: "darren", weight: 0.3 },
    ],
  },
  {
    id: "eve",
    name: "Eve",
    emoji: "\u{1F33F}",
    role: "Community Design",
    balance: 5000,
    minThreshold: 2000,
    maxThreshold: 4500,
    allocations: [
      { target: "kwaxala", weight: 0.5 },
      { target: "regen", weight: 0.5 },
    ],
  },
  {
    id: "artem",
    name: "Artem",
    emoji: "\u{1F52C}",
    role: "Protocol Research",
    balance: 6000,
    minThreshold: 2500,
    maxThreshold: 5000,
    allocations: [
      { target: "ygg", weight: 0.3 },
      { target: "cascadia", weight: 0.4 },
      { target: "eve", weight: 0.3 },
    ],
  },
  {
    id: "carolanne",
    name: "Carol Anne",
    emoji: "\u{1FAB6}",
    role: "Indigenomics",
    balance: 4000,
    minThreshold: 3500,
    maxThreshold: 7000,
    allocations: [
      { target: "kwaxala", weight: 0.6 },
      { target: "cascadia", weight: 0.4 },
    ],
  },
  {
    id: "darren",
    name: "Darren",
    emoji: "\u{26A1}",
    role: "GPU Engineering",
    balance: 3000,
    minThreshold: 2800,
    maxThreshold: 5500,
    allocations: [
      { target: "ygg", weight: 0.5 },
      { target: "artem", weight: 0.5 },
    ],
  },
  {
    id: "cascadia",
    name: "Cascadia Fund",
    emoji: "\u{1F3D4}\u{FE0F}",
    role: "Bioregional Commons",
    balance: 15000,
    minThreshold: 5000,
    maxThreshold: 12000,
    allocations: [
      { target: "kwaxala", weight: 0.3 },
      { target: "regen", weight: 0.3 },
      { target: "carolanne", weight: 0.4 },
    ],
  },
  {
    id: "regen",
    name: "Regen CoLab",
    emoji: "\u{267B}\u{FE0F}",
    role: "Registry Systems",
    balance: 9000,
    minThreshold: 4000,
    maxThreshold: 8000,
    allocations: [
      { target: "artem", weight: 0.4 },
      { target: "eve", weight: 0.3 },
      { target: "cascadia", weight: 0.3 },
    ],
  },
  {
    id: "kwaxala",
    name: "Kwaxala",
    emoji: "\u{1F333}",
    role: "Forest Alliance",
    balance: 2000,
    minThreshold: 2000,
    maxThreshold: 5000,
    allocations: [
      { target: "carolanne", weight: 0.5 },
      { target: "cascadia", weight: 0.5 },
    ],
  },
];

/** Total initial funding across all participants */
export const totalInitialFunding = mockParticipants.reduce(
  (sum, p) => sum + p.balance,
  0
);
