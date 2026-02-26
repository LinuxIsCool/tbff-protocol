import type { Participant } from "./engine";

/**
 * 5 Mycopunks members with realistic cross-allocations.
 * Total funding: $32,000. Sum of maxes: $40,000.
 * Christina starts above threshold to demo overflow immediately.
 */
export const mockParticipants: Participant[] = [
  {
    id: "shawn",
    name: "Shawn",
    emoji: "\u{1F332}",
    role: "AI Infrastructure",
    balance: 6000,
    minThreshold: 3000,
    maxThreshold: 8000,
    allocations: [
      { target: "jeff", weight: 0.3 },
      { target: "darren", weight: 0.4 },
      { target: "simon", weight: 0.3 },
    ],
  },
  {
    id: "jeff",
    name: "Jeff",
    emoji: "\u{1F527}",
    role: "Protocol Engineering",
    balance: 5000,
    minThreshold: 3000,
    maxThreshold: 8000,
    allocations: [
      { target: "shawn", weight: 0.4 },
      { target: "christina", weight: 0.3 },
      { target: "darren", weight: 0.3 },
    ],
  },
  {
    id: "darren",
    name: "Darren",
    emoji: "\u{26A1}",
    role: "GPU Engineering",
    balance: 4000,
    minThreshold: 3000,
    maxThreshold: 8000,
    allocations: [
      { target: "shawn", weight: 0.5 },
      { target: "jeff", weight: 0.5 },
    ],
  },
  {
    id: "simon",
    name: "Simon",
    emoji: "\u{1F3D7}\u{FE0F}",
    role: "Systems Design",
    balance: 7000,
    minThreshold: 3000,
    maxThreshold: 8000,
    allocations: [
      { target: "christina", weight: 0.5 },
      { target: "shawn", weight: 0.25 },
      { target: "jeff", weight: 0.25 },
    ],
  },
  {
    id: "christina",
    name: "Christina",
    emoji: "\u{1F310}",
    role: "Network Facilitation",
    balance: 10000,
    minThreshold: 3000,
    maxThreshold: 8000,
    allocations: [
      { target: "simon", weight: 0.3 },
      { target: "darren", weight: 0.3 },
      { target: "jeff", weight: 0.2 },
      { target: "shawn", weight: 0.2 },
    ],
  },
];

/** Total initial funding across all participants */
export const totalInitialFunding = mockParticipants.reduce(
  (sum, p) => sum + p.balance,
  0
);
