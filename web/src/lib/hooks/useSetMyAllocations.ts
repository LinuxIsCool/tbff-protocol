"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import { TBFF_NETWORK_ADDRESS, TARGET_CHAIN_ID } from "@/lib/tbff/live-config";

const WAD = BigInt(1e18);

/**
 * Convert percentage weights (0-100) to WAD bigints with remainder-to-last.
 * Three allocations of 33.33% would produce 999999999999999999 total,
 * off by 1 from 1e18. The remainder pattern prevents InvalidWeights revert.
 */
function percentagesToWad(percentages: number[]): bigint[] {
  if (percentages.length === 0) return [];

  const weights: bigint[] = [];
  let sumSoFar = 0n;

  for (let i = 0; i < percentages.length - 1; i++) {
    const w = (WAD * BigInt(Math.round(percentages[i] * 100))) / 10000n;
    weights.push(w);
    sumSoFar += w;
  }

  // Last weight absorbs rounding remainder
  weights.push(WAD - sumSoFar);
  return weights;
}

export function useSetMyAllocations() {
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash });

  function submit(
    targetIndices: number[],
    percentages: number[]
  ) {
    const wadWeights = percentagesToWad(percentages);

    writeContract({
      address: TBFF_NETWORK_ADDRESS,
      abi: tbffNetworkAbi,
      functionName: "setMyAllocations",
      args: [
        targetIndices.map(BigInt),
        wadWeights.map((w) => BigInt(w)),
      ],
      chainId: TARGET_CHAIN_ID,
    });
  }

  return {
    submit,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ?? confirmError,
  };
}
