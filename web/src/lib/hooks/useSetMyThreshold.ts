"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import { TBFF_NETWORK_ADDRESS, TARGET_CHAIN_ID } from "@/lib/tbff/live-config";
import { usdToWad } from "@/lib/tbff/chain-bridge";

export function useSetMyThreshold() {
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

  function submit(thresholdUsd: number) {
    writeContract({
      address: TBFF_NETWORK_ADDRESS,
      abi: tbffNetworkAbi,
      functionName: "setMyThreshold",
      args: [usdToWad(thresholdUsd)],
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
