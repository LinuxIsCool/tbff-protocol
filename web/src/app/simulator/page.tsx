"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import NetworkGraph from "@/components/NetworkGraph";
import DataTable from "@/components/DataTable";
import AllocationEditor from "@/components/AllocationEditor";
import {
  converge,
  iterateOnce,
  type Participant,
  type Allocation,
  type IterationSnapshot,
} from "@/lib/tbff/engine";
import { mockParticipants } from "@/lib/tbff/mock-data";

export default function SimulatorPage() {
  const [participants, setParticipants] = useState<Participant[]>(
    () => mockParticipants.map((p) => ({ ...p }))
  );
  const [snapshots, setSnapshots] = useState<IterationSnapshot[]>([]);
  const [converged, setConverged] = useState(false);
  const [totalRedistributed, setTotalRedistributed] = useState(0);
  const initialBalancesRef = useRef<Record<string, number>>({});

  // Fix 5: Memoize currentBalances to avoid invalidating useCallback deps
  const currentBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (snapshots.length > 0) {
      const last = snapshots[snapshots.length - 1];
      for (const p of participants) {
        balances[p.id] = last.balances[p.id] ?? p.balance;
      }
    } else {
      for (const p of participants) {
        balances[p.id] = p.balance;
      }
    }
    return balances;
  }, [participants, snapshots]);

  // Fix 6: Extract shared reset logic
  const resetSimulationState = useCallback(() => {
    setSnapshots([]);
    setConverged(false);
    setTotalRedistributed(0);
    initialBalancesRef.current = {};
  }, []);

  // Seed initial balances on first interaction
  const seedInitialBalances = useCallback(() => {
    if (Object.keys(initialBalancesRef.current).length === 0) {
      initialBalancesRef.current = Object.fromEntries(
        participants.map((p) => [p.id, p.balance])
      );
    }
  }, [participants]);

  const handleNextIteration = useCallback(() => {
    seedInitialBalances();
    const currentParticipants = participants.map((p) => ({
      ...p,
      balance: currentBalances[p.id] ?? p.balance,
    }));

    const iterNum = snapshots.length + 1;
    const { newBalances, changed, snapshot } = iterateOnce(
      currentParticipants,
      iterNum
    );

    setSnapshots((prev) => [...prev, snapshot]);

    if (!changed) {
      setConverged(true);
    }

    setParticipants((prev) =>
      prev.map((p) => ({ ...p, balance: newBalances[p.id] ?? p.balance }))
    );

    const iterRedist = snapshot.transfers.reduce((s, t) => s + t.amount, 0);
    setTotalRedistributed((prev) => prev + iterRedist);
  }, [participants, snapshots, currentBalances, seedInitialBalances]);

  const handleRunAll = useCallback(() => {
    seedInitialBalances();
    const result = converge(
      participants.map((p) => ({
        ...p,
        balance: initialBalancesRef.current[p.id] ?? p.balance,
      })),
      50
    );

    setSnapshots(result.snapshots);
    setConverged(result.converged);
    setTotalRedistributed(result.totalRedistributed);

    setParticipants((prev) =>
      prev.map((p) => ({
        ...p,
        balance: result.finalBalances[p.id] ?? p.balance,
      }))
    );
  }, [participants, seedInitialBalances]);

  const handleReset = useCallback(() => {
    setParticipants(mockParticipants.map((p) => ({ ...p })));
    resetSimulationState();
  }, [resetSimulationState]);

  const handleBalanceChange = useCallback(
    (id: string, value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) return;
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, balance: num } : p))
      );
      resetSimulationState();
    },
    [resetSimulationState]
  );

  const handleThresholdChange = useCallback(
    (id: string, value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) return;
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, maxThreshold: num } : p))
      );
      resetSimulationState();
    },
    [resetSimulationState]
  );

  const handleAllocationChange = useCallback(
    (id: string, allocations: Allocation[]) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, allocations } : p))
      );
      resetSimulationState();
    },
    [resetSimulationState]
  );

  const totalFunding = participants.reduce((s, p) => s + p.balance, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">TBFF Simulator</h1>
        <Badge variant="secondary">Phase 1 MVP</Badge>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span>Iteration: {snapshots.length}</span>
          <Separator orientation="vertical" className="h-4" />
          {converged ? (
            <Badge variant="default" className="bg-green-600">
              Converged
            </Badge>
          ) : snapshots.length > 0 ? (
            <Badge variant="secondary">Running</Badge>
          ) : (
            <Badge variant="outline">Ready</Badge>
          )}
        </div>
      </header>

      <div className="p-6 grid gap-6 lg:grid-cols-[1fr_1.5fr] xl:grid-cols-[350px_1fr_1fr]">
        {/* Panel 1: Input Configuration */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-2">
              Total Funding: ${totalFunding.toLocaleString()}
            </div>
            {participants.map((p) => (
              <div
                key={p.id}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.emoji}</span>
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.role}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Balance
                    </label>
                    <Input
                      type="number"
                      value={
                        snapshots.length === 0
                          ? p.balance
                          : initialBalancesRef.current[p.id] ?? p.balance
                      }
                      onChange={(e) =>
                        handleBalanceChange(p.id, e.target.value)
                      }
                      className="h-8 text-sm"
                      disabled={snapshots.length > 0}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Max Threshold
                    </label>
                    <Input
                      type="number"
                      value={p.maxThreshold}
                      onChange={(e) =>
                        handleThresholdChange(p.id, e.target.value)
                      }
                      className="h-8 text-sm"
                      disabled={snapshots.length > 0}
                    />
                  </div>
                </div>
                <AllocationEditor
                  participant={p}
                  allParticipants={participants}
                  onAllocationsChange={(allocs) => handleAllocationChange(p.id, allocs)}
                  disabled={snapshots.length > 0}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Panel 2: Visualization */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Network
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleNextIteration}
                  disabled={converged}
                >
                  Next Iteration
                </Button>
                <Button
                  size="sm"
                  onClick={handleRunAll}
                  disabled={converged}
                >
                  Run All
                </Button>
                <Button size="sm" variant="ghost" onClick={handleReset}>
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <NetworkGraph
              participants={participants}
              currentBalances={currentBalances}
            />
            {snapshots.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
                <div>
                  <div className="text-muted-foreground">Iterations</div>
                  <div className="text-lg font-bold">{snapshots.length}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Redistributed</div>
                  <div className="text-lg font-bold">
                    ${Math.round(totalRedistributed).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="text-lg font-bold">
                    {converged ? "Converged" : "In Progress"}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel 3: Data Table */}
        <Card className="lg:col-span-2 xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Balance History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              participants={participants}
              snapshots={snapshots}
              initialBalances={
                Object.keys(initialBalancesRef.current).length > 0
                  ? initialBalancesRef.current
                  : Object.fromEntries(participants.map((p) => [p.id, p.balance]))
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
