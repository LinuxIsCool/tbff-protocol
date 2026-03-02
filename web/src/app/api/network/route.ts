import { createPublicClient, http, formatUnits } from "viem";
import { hardhat } from "viem/chains";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import { TBFF_NETWORK_ADDRESS } from "@/lib/tbff/live-config";
import { NextResponse } from "next/server";

const client = createPublicClient({
  chain: hardhat,
  transport: http("http://127.0.0.1:8545"),
});

export async function GET() {
  try {
    const [
      networkState,
      nodeCount,
      streams,
      timestamp,
      iterations,
      converged,
      redistributed,
      profileData,
      flowThroughData,
    ] = await Promise.all([
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "getNetworkState",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "getNodeCount",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "getActiveStreams",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "lastSettleTimestamp",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "lastSettleIterations",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "lastSettleConverged",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "lastSettleTotalRedistributed",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "getAllProfiles",
      }),
      client.readContract({
        address: TBFF_NETWORK_ADDRESS,
        abi: tbffNetworkAbi,
        functionName: "getFlowThrough",
      }),
    ]);

    const [nodes, balances, thresholds] = networkState as [
      `0x${string}`[],
      bigint[],
      bigint[],
    ];
    const [froms, tos, rates] = streams as [
      `0x${string}`[],
      `0x${string}`[],
      bigint[],
    ];
    const [profileAddrs, profileNames, profileEmojis, profileRoles] = profileData as [
      `0x${string}`[],
      string[],
      string[],
      string[],
    ];
    const [, flowAmounts] = flowThroughData as [
      `0x${string}`[],
      bigint[],
    ];

    return NextResponse.json({
      nodes,
      balances: balances.map((b) => formatUnits(b, 18)),
      thresholds: thresholds.map((t) => formatUnits(t, 18)),
      nodeCount: Number(nodeCount),
      streams: froms.map((f, i) => ({
        from: f,
        to: tos[i],
        rate: rates[i].toString(),
      })),
      lastSettle: {
        timestamp: Number(timestamp),
        iterations: Number(iterations),
        converged: converged as boolean,
        totalRedistributed: formatUnits(redistributed as bigint, 18),
      },
      profiles: profileAddrs.map((addr, i) => ({
        address: addr,
        name: profileNames[i],
        emoji: profileEmojis[i],
        role: profileRoles[i],
      })),
      flowThrough: flowAmounts.map((a) => formatUnits(a, 18)),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
