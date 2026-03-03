"use client";

import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { cfaV1ForwarderAbi } from "@/lib/tbff/abis/CFAv1Forwarder";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import {
  TBFF_NETWORK_ADDRESS,
  SUPER_TOKEN_ADDRESS,
  CFA_FORWARDER_ADDRESS,
  TARGET_CHAIN_ID,
} from "@/lib/tbff/live-config";
import { usdToWad } from "@/lib/tbff/chain-bridge";

export type RegistrationStep =
  | "idle"
  | "granting"
  | "registering"
  | "done"
  | "error";

export function useRegister() {
  const [step, setStep] = useState<RegistrationStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });

  async function register(
    maxThresholdUsd: number,
    minThresholdUsd: number,
    name: string,
    emoji: string,
    role: string
  ) {
    setStep("granting");
    setError(null);

    try {
      // Step 1: Grant CFA operator permissions
      const grantHash = await writeContractAsync({
        address: CFA_FORWARDER_ADDRESS,
        abi: cfaV1ForwarderAbi,
        functionName: "grantPermissions",
        args: [SUPER_TOKEN_ADDRESS, TBFF_NETWORK_ADDRESS],
        chainId: TARGET_CHAIN_ID,
      });

      await publicClient!.waitForTransactionReceipt({ hash: grantHash });

      // Step 2: Self-register
      setStep("registering");
      const registerHash = await writeContractAsync({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "selfRegister",
        args: [usdToWad(maxThresholdUsd), usdToWad(minThresholdUsd), name, emoji, role],
        chainId: TARGET_CHAIN_ID,
      });

      await publicClient!.waitForTransactionReceipt({ hash: registerHash });

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

  return { register, step, error, reset };
}
