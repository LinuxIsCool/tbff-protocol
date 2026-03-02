"use client";

import { useReadContract } from "wagmi";
import { cfaV1ForwarderAbi } from "@/lib/tbff/abis/CFAv1Forwarder";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import {
  CFA_FORWARDER_ADDRESS,
  SUPER_TOKEN_ADDRESS,
  TBFF_NETWORK_ADDRESS,
} from "@/lib/tbff/live-config";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";

export interface StreamInfo {
  from: Address;
  to: Address;
  rate: bigint;
}

export function useSuperfluidStreams() {
  const { data: activeStreams, isLoading, refetch } = useReadContract({
    address: TBFF_NETWORK_ADDRESS,
    abi: tbffNetworkAbi,
    functionName: "getActiveStreams",
    query: { refetchInterval: 30_000 },
  });

  const streams: StreamInfo[] = [];
  if (activeStreams) {
    const [froms, tos, rates] = activeStreams as [Address[], Address[], bigint[]];
    for (let i = 0; i < froms.length; i++) {
      streams.push({ from: froms[i], to: tos[i], rate: rates[i] });
    }
  }

  return { streams, isLoading, refetch };
}

export function useAccountFlowInfo(nodes: Address[] | undefined) {
  const contracts = (nodes ?? []).map((node) => ({
    address: CFA_FORWARDER_ADDRESS,
    abi: cfaV1ForwarderAbi,
    functionName: "getAccountFlowInfo" as const,
    args: [SUPER_TOKEN_ADDRESS, node] as const,
  }));

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { refetchInterval: 30_000, enabled: (nodes?.length ?? 0) > 0 },
  });

  const flowInfo = new Map<Address, { netFlowRate: bigint; lastUpdated: bigint }>();

  if (data && nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const result = data[i]?.result as [bigint, bigint, bigint, bigint] | undefined;
      if (result) {
        flowInfo.set(nodes[i], {
          lastUpdated: result[0],
          netFlowRate: result[1],
        });
      }
    }
  }

  return { flowInfo, isLoading };
}
