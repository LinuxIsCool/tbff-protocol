"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Allocation, Participant } from "@/lib/tbff/engine";
import { normalizeWeights } from "@/lib/tbff/allocation-utils";

interface AllocationEditorProps {
  participant: Participant;
  allParticipants: Participant[];
  onAllocationsChange: (allocations: Allocation[]) => void;
  disabled: boolean;
}

export default function AllocationEditor({
  participant,
  allParticipants,
  onAllocationsChange,
  disabled,
}: AllocationEditorProps) {
  const [expanded, setExpanded] = useState(false);

  const weightSum = participant.allocations.reduce((s, a) => s + a.weight, 0);
  const sumPct = Math.round(weightSum * 100);

  const availableTargets = useMemo(() => {
    const existingTargets = new Set(participant.allocations.map((a) => a.target));
    return allParticipants.filter(
      (p) => p.id !== participant.id && !existingTargets.has(p.id)
    );
  }, [participant, allParticipants]);

  const handleWeightChange = (index: number, newWeight: number) => {
    const updated = participant.allocations.map((a, i) =>
      i === index ? { ...a, weight: newWeight } : a
    );
    onAllocationsChange(updated);
  };

  const handleTargetChange = (index: number, newTarget: string) => {
    const updated = participant.allocations.map((a, i) =>
      i === index ? { ...a, target: newTarget } : a
    );
    onAllocationsChange(updated);
  };

  const handleRemove = (index: number) => {
    const updated = participant.allocations.filter((_, i) => i !== index);
    onAllocationsChange(updated);
  };

  const handleAdd = (targetId: string) => {
    const updated = [
      ...participant.allocations,
      { target: targetId, weight: 0 },
    ];
    onAllocationsChange(updated);
  };

  const handleNormalize = () => {
    onAllocationsChange(normalizeWeights(participant.allocations));
  };

  const handleCollapse = () => {
    // Auto-normalize on collapse if weights don't sum to 1.0
    if (participant.allocations.length > 0 && Math.abs(weightSum - 1.0) > 0.001) {
      onAllocationsChange(normalizeWeights(participant.allocations));
    }
    setExpanded(false);
  };

  // Collapsed view
  if (!expanded) {
    return (
      <div
        className={`text-xs text-muted-foreground ${disabled ? "" : "cursor-pointer hover:text-foreground"}`}
        onClick={disabled ? undefined : () => setExpanded(true)}
      >
        Min: ${participant.minThreshold.toLocaleString()} | Allocations:{" "}
        {participant.allocations.length === 0
          ? "none"
          : participant.allocations
              .map((a) => `${a.target} ${Math.round(a.weight * 100)}%`)
              .join(", ")}
        {!disabled && (
          <span className="ml-1 text-blue-400">(edit)</span>
        )}
      </div>
    );
  }

  // Expanded view
  const sumColor =
    sumPct === 100
      ? "text-green-400"
      : sumPct > 100
      ? "text-red-400"
      : "text-yellow-400";

  return (
    <div className="space-y-2 border-t pt-2 mt-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Min: ${participant.minThreshold.toLocaleString()}
        </span>
        <span className={`text-xs font-medium ${sumColor}`}>
          Sum: {sumPct}%
        </span>
      </div>

      {participant.allocations.map((alloc, i) => {
        const targetP = allParticipants.find((p) => p.id === alloc.target);
        return (
          <div key={`${alloc.target}-${i}`} className="flex items-center gap-1.5">
            <Select
              value={alloc.target}
              onValueChange={(v) => handleTargetChange(i, v)}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Current target + available targets */}
                {targetP && (
                  <SelectItem value={targetP.id}>
                    {targetP.emoji} {targetP.name}
                  </SelectItem>
                )}
                {availableTargets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Slider
              value={[Math.round(alloc.weight * 100)]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => handleWeightChange(i, v / 100)}
              className="flex-1"
            />

            <Input
              type="number"
              value={Math.round(alloc.weight * 100)}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (!isNaN(v)) handleWeightChange(i, Math.max(0, Math.min(100, v)) / 100);
              }}
              className="h-7 w-14 text-xs text-center"
              min={0}
              max={100}
            />

            <span className="text-xs text-muted-foreground">%</span>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
              onClick={() => handleRemove(i)}
            >
              x
            </Button>
          </div>
        );
      })}

      {/* Add allocation */}
      {availableTargets.length > 0 && (
        <Select onValueChange={handleAdd}>
          <SelectTrigger className="h-7 text-xs text-muted-foreground">
            <SelectValue placeholder="+ Add allocation..." />
          </SelectTrigger>
          <SelectContent>
            {availableTargets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Actions */}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs flex-1"
          onClick={handleNormalize}
          disabled={participant.allocations.length === 0}
        >
          Normalize to 100%
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs flex-1"
          onClick={handleCollapse}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
