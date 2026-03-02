"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import { TBFF_NETWORK_ADDRESS } from "@/lib/tbff/live-config";
import type { Address } from "viem";

const networkContract = {
  address: TBFF_NETWORK_ADDRESS,
  abi: tbffNetworkAbi,
} as const;

export function useTBFFNetwork() {
  const { data: networkState, isLoading, isError, refetch } = useReadContract({
    ...networkContract,
    functionName: "getNetworkState",
    query: { refetchInterval: 15_000 },
  });

  const { data: settleData } = useReadContracts({
    contracts: [
      { ...networkContract, functionName: "lastSettleTimestamp" },
      { ...networkContract, functionName: "lastSettleIterations" },
      { ...networkContract, functionName: "lastSettleConverged" },
      { ...networkContract, functionName: "lastSettleTotalRedistributed" },
    ],
    query: { refetchInterval: 15_000 },
  });

  const nodes = networkState?.[0] as Address[] | undefined;
  const balances = networkState?.[1] as bigint[] | undefined;
  const thresholds = networkState?.[2] as bigint[] | undefined;

  const lastSettle = settleData
    ? {
        timestamp: settleData[0]?.result as bigint | undefined,
        iterations: settleData[1]?.result as bigint | undefined,
        converged: settleData[2]?.result as boolean | undefined,
        totalRedistributed: settleData[3]?.result as bigint | undefined,
      }
    : undefined;

  return { nodes, balances, thresholds, lastSettle, isLoading, isError, refetch };
}
