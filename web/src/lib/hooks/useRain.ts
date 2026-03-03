"use client";

import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import {
  TBFF_NETWORK_ADDRESS,
  SUPER_TOKEN_ADDRESS,
  TARGET_CHAIN_ID,
} from "@/lib/tbff/live-config";
import { usdToWad } from "@/lib/tbff/chain-bridge";

// Minimal ERC20 ABI for approve
const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export type RainStep = "idle" | "approving" | "raining" | "done" | "error";

export function useRain() {
  const [step, setStep] = useState<RainStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });

  async function rain(amountUsd: number) {
    setStep("approving");
    setError(null);

    try {
      const wadAmount = usdToWad(amountUsd);

      // Step 1: Approve token spend
      const approveHash = await writeContractAsync({
        address: SUPER_TOKEN_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [TBFF_NETWORK_ADDRESS, wadAmount],
        chainId: TARGET_CHAIN_ID,
      });

      await publicClient!.waitForTransactionReceipt({ hash: approveHash });

      // Step 2: Rain
      setStep("raining");
      const rainHash = await writeContractAsync({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "rain",
        args: [wadAmount],
        chainId: TARGET_CHAIN_ID,
      });

      await publicClient!.waitForTransactionReceipt({ hash: rainHash });

      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
  }

  return { rain, step, error, reset };
}
