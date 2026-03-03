/**
 * Convert mock-data participants to SimParticipant format
 * with color assignments for the force graph.
 */

import { mockParticipants } from "@/lib/tbff/mock-data";
import { colorForParticipant } from "./node-colors";
import type { SimParticipant } from "./types";

export const initialParticipants: SimParticipant[] = mockParticipants.map(
  (p, i) => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    role: p.role,
    color: colorForParticipant(p.id, i),
    initialBalance: p.balance,
    minThreshold: p.minThreshold,
    maxThreshold: p.maxThreshold,
    allocations: p.allocations.map((a) => ({
      target: a.target,
      weight: a.weight,
    })),
  })
);
