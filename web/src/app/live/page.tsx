"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import NetworkGraph from "@/components/NetworkGraph";
import { PARTICIPANT_METADATA } from "@/lib/tbff/chain-bridge";
import { TBFF_NETWORK_ADDRESS, SUPER_TOKEN_ADDRESS } from "@/lib/tbff/live-config";
import type { Participant } from "@/lib/tbff/engine";

interface NetworkData {
  nodes: string[];
  balances: string[];
  thresholds: string[];
  nodeCount: number;
  streams: { from: string; to: string; rate: string }[];
  lastSettle: {
    timestamp: number;
    iterations: number;
    converged: boolean;
    totalRedistributed: string;
  };
}

function formatTimestamp(ts: number): string {
  if (!ts) return "Never";
  return new Date(ts * 1000).toLocaleString();
}

function flowRateToMonthly(rateStr: string): number {
  const rate = BigInt(rateStr);
  const monthly = rate * 30n * 24n * 60n * 60n;
  return Number(monthly / BigInt(1e12)) / 1e6;
}

export default function LivePage() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleResult, setSettleResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/network");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setIsError(false);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleSettle() {
    setSettling(true);
    setSettleResult(null);
    try {
      const res = await fetch("/api/settle", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setSettleResult(`Error: ${json.error.slice(0, 120)}`);
      } else {
        setSettleResult(`Redistribution confirmed! Block #${json.blockNumber}`);
        fetchData();
      }
    } catch (e: unknown) {
      setSettleResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSettling(false);
    }
  }

  // Bridge API data to Participant[] for NetworkGraph
  const participants: Participant[] = [];
  const currentBalances: Record<string, number> = {};
  if (data) {
    for (let i = 0; i < data.nodes.length; i++) {
      const addr = data.nodes[i].toLowerCase();
      const meta = PARTICIPANT_METADATA[addr];
      const bal = Number(data.balances[i]);
      const thresh = Number(data.thresholds[i]);
      const id = meta?.id ?? addr.slice(0, 8);

      participants.push({
        id,
        name: meta?.name ?? `Node ${addr.slice(0, 6)}`,
        emoji: meta?.emoji ?? "\u{1F7E2}",
        role: meta?.role ?? "Participant",
        balance: bal,
        minThreshold: 3000,
        maxThreshold: thresh,
        allocations: [],
      });
      currentBalances[id] = bal;
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight">TBFF Live</h1>
        <Badge variant="secondary">On-Chain</Badge>
        <Badge variant="secondary">Anvil (Local)</Badge>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
          Loading network data...
        </div>
      ) : isError ? (
        <div className="p-6">
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <p className="text-destructive font-medium">Failed to read contract data</p>
              <p className="text-sm text-muted-foreground">
                Make sure Anvil is running on port 8545 and contracts are deployed.
              </p>
              <Button variant="outline" onClick={fetchData}>
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
                <Button size="sm" onClick={handleSettle} disabled={settling}>
                  {settling ? "Settling..." : "Trigger Redistribution"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <NetworkGraph
                participants={participants}
                currentBalances={currentBalances}
              />

              {settleResult && (
                <p
                  className={`text-sm mt-2 ${
                    settleResult.startsWith("Error") ? "text-destructive" : "text-green-500"
                  }`}
                >
                  {settleResult}
                </p>
              )}

              {/* Active streams legend */}
              {data && data.streams.length > 0 && (
                <div className="mt-4 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Active Streams
                  </p>
                  {data.streams.map((s, i) => {
                    const fromMeta = PARTICIPANT_METADATA[s.from.toLowerCase()];
                    const toMeta = PARTICIPANT_METADATA[s.to.toLowerCase()];
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
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
                      <th className="pb-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.nodes.map((addr, i) => {
                      const meta = PARTICIPANT_METADATA[addr.toLowerCase()];
                      const bal = Number(data.balances[i]);
                      const thresh = Number(data.thresholds[i]);
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

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Last Settlement</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span>{formatTimestamp(data?.lastSettle.timestamp ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Iterations</span>
                    <span>{data?.lastSettle.iterations ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Converged</span>
                    <span>{data?.lastSettle.converged ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Redistributed</span>
                    <span>
                      {Number(data?.lastSettle.totalRedistributed ?? 0) > 0
                        ? `$${Math.round(Number(data?.lastSettle.totalRedistributed)).toLocaleString()}`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Network Health</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nodes</span>
                    <span>{data?.nodeCount ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Streams</span>
                    <span>{data?.streams.length ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Value</span>
                    <span>
                      $
                      {data
                        ? Math.round(
                            data.balances.reduce((sum, b) => sum + Number(b), 0)
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
