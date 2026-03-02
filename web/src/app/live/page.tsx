"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import NetworkGraph from "@/components/NetworkGraph";
import { useTBFFNetwork } from "@/lib/hooks/useTBFFNetwork";
import { useSuperfluidStreams, useAccountFlowInfo } from "@/lib/hooks/useSuperfluidStreams";
import { useAnimatedBalances } from "@/lib/hooks/useAnimatedBalances";
import { useRedistribute } from "@/lib/hooks/useRedistribute";
import {
  wadToUsd,
  flowRateToMonthly,
  bridgeToParticipant,
  PARTICIPANT_METADATA,
} from "@/lib/tbff/chain-bridge";
import {
  BASE_SEPOLIA_CHAIN_ID,
  HARDHAT_CHAIN_ID,
  TARGET_CHAIN_ID,
  TBFF_NETWORK_ADDRESS,
  SUPER_TOKEN_ADDRESS,
} from "@/lib/tbff/live-config";
import type { Participant } from "@/lib/tbff/engine";

function ChainBadge() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return <Badge variant="secondary">Base Sepolia</Badge>;
  }
  if (chainId === HARDHAT_CHAIN_ID) {
    return <Badge variant="secondary">Anvil (Local)</Badge>;
  }
  return (
    <Badge
      variant="destructive"
      className="cursor-pointer"
      onClick={() => switchChain?.({ chainId: BASE_SEPOLIA_CHAIN_ID })}
    >
      Wrong Network — Click to Switch
    </Badge>
  );
}

function formatTimestamp(ts: bigint | undefined): string {
  if (!ts || ts === 0n) return "Never";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export default function LivePage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isCorrectChain = chainId === TARGET_CHAIN_ID;
  const { nodes, balances, thresholds, lastSettle, isLoading, isError, refetch } =
    useTBFFNetwork();
  const { streams } = useSuperfluidStreams();
  const { flowInfo } = useAccountFlowInfo(nodes);
  const animatedBalances = useAnimatedBalances({
    nodes,
    balances,
    flowInfo,
  });
  const { trigger, isPending, isConfirming, isSuccess, error } = useRedistribute();

  // Bridge on-chain data to Participant[] for NetworkGraph
  const participants: Participant[] = [];
  if (nodes && balances && thresholds) {
    for (let i = 0; i < nodes.length; i++) {
      participants.push(
        bridgeToParticipant(nodes[i], balances[i], thresholds[i], nodes)
      );
    }
  }

  // Build currentBalances keyed by participant ID for NetworkGraph
  const currentBalances: Record<string, number> = {};
  if (nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const addr = nodes[i].toLowerCase();
      const meta = PARTICIPANT_METADATA[addr];
      const id = meta?.id ?? addr.slice(0, 8);
      currentBalances[id] = animatedBalances[addr] ?? wadToUsd(balances?.[i] ?? 0n);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight">TBFF Live</h1>
        <Badge variant="secondary">On-Chain</Badge>
        <ChainBadge />
        <div className="ml-auto">
          <ConnectButton showBalance={false} />
        </div>
      </header>

      {!isConnected ? (
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <p className="text-lg font-medium">Connect your wallet to view the live TBFF network</p>
              <p className="text-sm text-muted-foreground">
                The live page reads on-chain balances and Superfluid streams in real-time.
              </p>
              <ConnectButton />
            </CardContent>
          </Card>
        </div>
      ) : isError ? (
        <div className="p-6">
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <p className="text-destructive font-medium">Failed to read contract data</p>
              <p className="text-sm text-muted-foreground">
                Make sure the TBFFNetwork contract is deployed and you&apos;re on the correct chain.
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="p-6 grid gap-6 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1.2fr_0.8fr]">
          {/* Network Panel */}
          <Card className="xl:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Network
                </CardTitle>
                {isCorrectChain ? (
                  <Button
                    size="sm"
                    onClick={trigger}
                    disabled={isPending || isConfirming}
                  >
                    {isPending
                      ? "Signing..."
                      : isConfirming
                      ? "Confirming..."
                      : "Trigger Redistribution"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => switchChain?.({ chainId: TARGET_CHAIN_ID })}
                  >
                    Switch Network to Settle
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  Loading network...
                </div>
              ) : (
                <NetworkGraph
                  participants={participants}
                  currentBalances={currentBalances}
                />
              )}

              {/* Settle status */}
              {isSuccess && (
                <p className="text-sm text-green-500 mt-2">
                  Redistribution confirmed!
                </p>
              )}
              {error && (
                <p className="text-sm text-destructive mt-2">
                  Error: {error.message?.slice(0, 100)}
                </p>
              )}

              {/* Active streams legend */}
              {streams.length > 0 && (
                <div className="mt-4 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Active Streams
                  </p>
                  {streams.map((s, i) => {
                    const fromMeta =
                      PARTICIPANT_METADATA[s.from.toLowerCase()];
                    const toMeta = PARTICIPANT_METADATA[s.to.toLowerCase()];
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span>
                          {fromMeta?.emoji ?? "?"} {fromMeta?.name ?? s.from.slice(0, 6)}
                        </span>
                        <span className="text-muted-foreground">&rarr;</span>
                        <span>
                          {toMeta?.emoji ?? "?"} {toMeta?.name ?? s.to.slice(0, 6)}
                        </span>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                          ${flowRateToMonthly(s.rate).toFixed(0)}/mo
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Balance Panel */}
          <Card className="xl:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Balances
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="pb-2">Member</th>
                      <th className="pb-2 text-right">Balance</th>
                      <th className="pb-2 text-right">Threshold</th>
                      <th className="pb-2 text-right">Flow</th>
                      <th className="pb-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes?.map((addr, i) => {
                      const meta = PARTICIPANT_METADATA[addr.toLowerCase()];
                      const bal = animatedBalances[addr.toLowerCase()] ?? wadToUsd(balances?.[i] ?? 0n);
                      const thresh = wadToUsd(thresholds?.[i] ?? 0n);
                      const info = flowInfo.get(addr);
                      const monthlyFlow = info ? flowRateToMonthly(info.netFlowRate) : 0;
                      const isOverflowing = bal > thresh;

                      return (
                        <tr key={addr} className="border-b border-border/50">
                          <td className="py-2">
                            <span className="mr-1">{meta?.emoji ?? "\u{1F7E2}"}</span>
                            {meta?.name ?? addr.slice(0, 8)}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">
                            ${Math.round(bal).toLocaleString()}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            ${Math.round(thresh).toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">
                            {monthlyFlow !== 0 ? (
                              <span className={monthlyFlow > 0 ? "text-green-500" : "text-red-400"}>
                                {monthlyFlow > 0 ? "+" : ""}
                                ${Math.abs(Math.round(monthlyFlow)).toLocaleString()}/mo
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 text-center">
                            {isOverflowing ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Overflow
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Healthy
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Info Panel */}
          <Card className="xl:col-span-1 lg:col-span-2 xl:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Network Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {/* Contract Addresses */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Contracts</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Network</span>
                    <code className="font-mono">
                      {TBFF_NETWORK_ADDRESS.slice(0, 6)}...{TBFF_NETWORK_ADDRESS.slice(-4)}
                    </code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Token</span>
                    <code className="font-mono">
                      {SUPER_TOKEN_ADDRESS.slice(0, 6)}...{SUPER_TOKEN_ADDRESS.slice(-4)}
                    </code>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Last Settle */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Last Settlement</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span>{formatTimestamp(lastSettle?.timestamp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Iterations</span>
                    <span>{lastSettle?.iterations?.toString() ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Converged</span>
                    <span>
                      {lastSettle?.converged === undefined
                        ? "—"
                        : lastSettle.converged
                        ? "Yes"
                        : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Redistributed</span>
                    <span>
                      {lastSettle?.totalRedistributed
                        ? `$${wadToUsd(lastSettle.totalRedistributed).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Network Health */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Network Health</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nodes</span>
                    <span>{nodes?.length ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Streams</span>
                    <span>{streams.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Value</span>
                    <span>
                      $
                      {balances
                        ? Math.round(
                            balances.reduce((sum, b) => sum + wadToUsd(b), 0)
                          ).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
