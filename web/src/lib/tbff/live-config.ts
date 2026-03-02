import type { Address } from "viem";

export const CFA_FORWARDER_ADDRESS: Address =
  "0xcfA132E353cB4E398080B9700609bb008eceB125";

export const TBFF_NETWORK_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_TBFF_NETWORK_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000";

export const SUPER_TOKEN_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_SUPER_TOKEN_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const HARDHAT_CHAIN_ID = 31337;

/**
 * Which chain the contracts are deployed on.
 * Hooks use this to force reads to the correct RPC regardless of wallet chain.
 */
export const TARGET_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_TARGET_CHAIN_ID ?? HARDHAT_CHAIN_ID
);
