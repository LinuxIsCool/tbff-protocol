"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type {
  SimParticipant,
  MonthlySnapshot,
  SimulationResult,
} from "@/lib/simulation/types";

interface NodeDetailPanelProps {
  participant: SimParticipant;
  snapshot: MonthlySnapshot;
  simulationResult: SimulationResult;
  selectedMonth: number;
  onThresholdChange: (id: string, field: "minThreshold" | "maxThreshold", value: number) => void;
}

export default function NodeDetailPanel({
  participant,
  snapshot,
  simulationResult,
  selectedMonth,
  onThresholdChange,
}: NodeDetailPanelProps) {
  const state = snapshot.nodeStates[participant.id];
  if (!state) return null;

  const { balance, flowedIn, flowedOut, isLocked, cumulativeFlowThrough } = state;
  const { minThreshold, maxThreshold } = participant;

  // Balance history for sparkline
  const balanceHistory = simulationResult.snapshots.map(
    (s) => s.nodeStates[participant.id]?.balance ?? 0
  );
  const maxBalance = Math.max(...balanceHistory, 1);

  // Triptych values
  const retained = balance;
  const continued = flowedOut;

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">{participant.emoji}</span>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{participant.name}</h3>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: participant.color }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{participant.role}</p>
        </div>
        {isLocked && (
          <Badge variant="outline" className="ml-auto text-xs border-yellow-500 text-yellow-400">
            🔒 Lockup
          </Badge>
        )}
      </div>

      <Separator />

      {/* Balance bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Balance</span>
          <span className="font-medium">${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="relative h-4 rounded bg-muted overflow-hidden">
          {/* Min threshold marker */}
          {maxThreshold > 0 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-yellow-500 z-10"
              style={{ left: `${(minThreshold / maxThreshold) * 100}%` }}
            />
          )}
          {/* Balance fill */}
          <div
            className="h-full rounded transition-all duration-300"
            style={{
              width: `${Math.min(100, maxThreshold > 0 ? (balance / maxThreshold) * 100 : 0)}%`,
              backgroundColor: participant.color,
              opacity: 0.8,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>$0</span>
          <span>min ${minThreshold.toLocaleString()}</span>
          <span>max ${maxThreshold.toLocaleString()}</span>
        </div>
      </div>

      <Separator />

      {/* Sparkline — balance history */}
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Balance History</span>
        <svg
          viewBox={`0 0 ${balanceHistory.length} 40`}
          className="w-full h-10"
          preserveAspectRatio="none"
        >
          {/* Current month indicator */}
          <line
            x1={selectedMonth}
            y1={0}
            x2={selectedMonth}
            y2={40}
            stroke="white"
            strokeWidth={0.5}
            strokeOpacity={0.3}
          />
          {/* Balance polyline */}
          <polyline
            fill="none"
            stroke={participant.color}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            points={balanceHistory
              .map((b, i) => `${i},${40 - (b / maxBalance) * 38}`)
              .join(" ")}
          />
          {/* Min threshold line */}
          <line
            x1={0}
            y1={40 - (minThreshold / maxBalance) * 38}
            x2={balanceHistory.length}
            y2={40 - (minThreshold / maxBalance) * 38}
            stroke="hsl(45, 80%, 50%)"
            strokeWidth={0.5}
            strokeDasharray="2,2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <Separator />

      {/* Triptych */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Flowed In</p>
          <p className="text-xs font-medium">${flowedIn.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Retained</p>
          <p className="text-xs font-medium">${retained.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Flowed Out</p>
          <p className="text-xs font-medium">${continued.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      <div className="text-center text-[10px] text-muted-foreground">
        Total flow-through: ${cumulativeFlowThrough.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>

      <Separator />

      {/* Threshold editors */}
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Thresholds</span>
        <div className="flex items-center gap-2">
          <label className="text-xs w-8">Min</label>
          <Input
            type="number"
            value={minThreshold}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0) onThresholdChange(participant.id, "minThreshold", v);
            }}
            className="h-7 text-xs"
            min={0}
            step={500}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs w-8">Max</label>
          <Input
            type="number"
            value={maxThreshold}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0) onThresholdChange(participant.id, "maxThreshold", v);
            }}
            className="h-7 text-xs"
            min={0}
            step={500}
          />
        </div>
      </div>
    </div>
  );
}
