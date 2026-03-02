"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import { TBFF_NETWORK_ADDRESS } from "@/lib/tbff/live-config";

export function useRedistribute() {
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

  function trigger() {
    writeContract({
      address: TBFF_NETWORK_ADDRESS,
      abi: tbffNetworkAbi,
      functionName: "settle",
    });
  }

  return {
    trigger,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ?? confirmError,
  };
}
