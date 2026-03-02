import type { Address } from "viem";
import type { Participant, Allocation } from "./engine";

/**
 * Convert WAD (1e18) bigint to USD number.
 * Preserves 6 decimal places while staying below JS safe integer boundary.
 */
export function wadToUsd(wad: bigint): number {
  return Number(wad / BigInt(1e12)) / 1e6;
}

/**
 * Convert USD number to WAD bigint.
 */
export function usdToWad(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6)) * BigInt(1e12);
}

/**
 * Convert int96 flowrate (tokens/sec in WAD) to $/month for display.
 */
export function flowRateToMonthly(flowRate: bigint): number {
  const secondsPerMonth = 30n * 24n * 60n * 60n;
  const monthlyWad = flowRate * secondsPerMonth;
  return wadToUsd(monthlyWad);
}

export interface ParticipantMetadata {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

/**
 * Mapping of on-chain addresses to Mycopunk identity metadata.
 * Updated after deployment with real addresses.
 */
export const PARTICIPANT_METADATA: Record<string, ParticipantMetadata> = {
  // Anvil accounts (default mnemonic, accounts 1-5)
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": {
    id: "shawn",
    name: "Shawn",
    emoji: "\u{1F332}",
    role: "AI Infrastructure",
  },
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": {
    id: "jeff",
    name: "Jeff",
    emoji: "\u{1F527}",
    role: "Protocol Engineering",
  },
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906": {
    id: "darren",
    name: "Darren",
    emoji: "\u{26A1}",
    role: "GPU Engineering",
  },
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65": {
    id: "simon",
    name: "Simon",
    emoji: "\u{1F3D7}\u{FE0F}",
    role: "Systems Design",
  },
  "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc": {
    id: "christina",
    name: "Christina",
    emoji: "\u{1F310}",
    role: "Network Facilitation",
  },
};

/**
 * On-chain profile data from getAllProfiles().
 */
export interface OnChainProfile {
  address: Address;
  name: string;
  emoji: string;
  role: string;
}

/**
 * Bridge on-chain node data to engine Participant type.
 * Uses metadata lookup for human-readable identity.
 */
export function bridgeToParticipant(
  address: Address,
  balance: bigint,
  threshold: bigint,
  allNodes: Address[],
  allocTargets?: number[],
  allocWeights?: bigint[]
): Participant {
  const meta = PARTICIPANT_METADATA[address.toLowerCase()] ?? {
    id: address.slice(0, 8),
    name: `Node ${address.slice(0, 6)}`,
    emoji: "\u{1F7E2}",
    role: "Participant",
  };

  const allocations: Allocation[] = [];
  if (allocTargets && allocWeights) {
    for (let i = 0; i < allocTargets.length; i++) {
      const targetAddr = allNodes[allocTargets[i]];
      const targetMeta = PARTICIPANT_METADATA[targetAddr?.toLowerCase() ?? ""];
      allocations.push({
        target: targetMeta?.id ?? targetAddr?.slice(0, 8) ?? `node-${allocTargets[i]}`,
        weight: Number(allocWeights[i]) / 1e18,
      });
    }
  }

  return {
    id: meta.id,
    name: meta.name,
    emoji: meta.emoji,
    role: meta.role,
    balance: wadToUsd(balance),
    minThreshold: 3000,
    maxThreshold: wadToUsd(threshold),
    allocations,
  };
}

/**
 * Bridge on-chain profile data to Participant type.
 * Prefers on-chain profile over static PARTICIPANT_METADATA.
 */
export function profileToParticipant(
  profile: OnChainProfile,
  balance: bigint,
  threshold: bigint,
): Participant {
  const hasProfile = profile.name.length > 0;
  const fallback = PARTICIPANT_METADATA[profile.address.toLowerCase()];

  const name = hasProfile ? profile.name : (fallback?.name ?? `Node ${profile.address.slice(0, 6)}`);
  const emoji = hasProfile ? profile.emoji : (fallback?.emoji ?? "\u{1F7E2}");
  const role = hasProfile ? profile.role : (fallback?.role ?? "Participant");
  const id = fallback?.id ?? profile.address.slice(0, 8).toLowerCase();

  return {
    id,
    name,
    emoji,
    role,
    balance: wadToUsd(balance),
    minThreshold: 3000,
    maxThreshold: wadToUsd(threshold),
    allocations: [],
  };
}
