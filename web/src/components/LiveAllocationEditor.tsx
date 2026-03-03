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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSetMyAllocations } from "@/lib/hooks/useSetMyAllocations";
import type { Address } from "viem";

interface NodeInfo {
  address: Address;
  index: number;
  name: string;
  emoji: string;
}

interface AllocationRow {
  targetIndex: number;
  percentage: number; // 0-100
}

interface LiveAllocationEditorProps {
  myAddress: Address;
  allNodes: NodeInfo[];
}

export default function LiveAllocationEditor({
  myAddress,
  allNodes,
}: LiveAllocationEditorProps) {
  const [open, setOpen] = useState(false);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const { submit, isPending, isConfirming, isSuccess, error } = useSetMyAllocations();

  const isSubmitting = isPending || isConfirming;

  // Exclude self from targets
  const eligibleNodes = useMemo(
    () => allNodes.filter((n) => n.address.toLowerCase() !== myAddress.toLowerCase()),
    [allNodes, myAddress]
  );

  const assignedIndices = new Set(allocations.map((a) => a.targetIndex));
  const availableNodes = eligibleNodes.filter((n) => !assignedIndices.has(n.index));

  const sum = allocations.reduce((s, a) => s + a.percentage, 0);
  const sumColor = sum === 100 ? "text-green-400" : sum > 100 ? "text-red-400" : "text-yellow-400";

  function handleWeightChange(i: number, pct: number) {
    setAllocations((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, percentage: pct } : a))
    );
  }

  function handleRemove(i: number) {
    setAllocations((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleAdd(nodeIndex: string) {
    setAllocations((prev) => [
      ...prev,
      { targetIndex: parseInt(nodeIndex), percentage: 0 },
    ]);
  }

  function handleNormalize() {
    if (allocations.length === 0) return;
    const currentSum = allocations.reduce((s, a) => s + a.percentage, 0);
    if (currentSum === 0) {
      const equal = Math.floor(100 / allocations.length);
      setAllocations((prev) =>
        prev.map((a, i) => ({
          ...a,
          percentage: i === prev.length - 1 ? 100 - equal * (prev.length - 1) : equal,
        }))
      );
    } else {
      const factor = 100 / currentSum;
      let remainder = 100;
      setAllocations((prev) =>
        prev.map((a, i) => {
          if (i === prev.length - 1) return { ...a, percentage: remainder };
          const normalized = Math.round(a.percentage * factor);
          remainder -= normalized;
          return { ...a, percentage: normalized };
        })
      );
    }
  }

  function handleSubmit() {
    const indices = allocations.map((a) => a.targetIndex);
    const pcts = allocations.map((a) => a.percentage);
    submit(indices, pcts);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && setOpen(v)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Set Allocations</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Allocations</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-end">
            <span className={`text-xs font-medium ${sumColor}`}>Sum: {sum}%</span>
          </div>

          {allocations.map((alloc, i) => {
            const node = allNodes.find((n) => n.index === alloc.targetIndex);
            return (
              <div key={alloc.targetIndex} className="flex items-center gap-1.5">
                <Select
                  value={String(alloc.targetIndex)}
                  onValueChange={(v) => {
                    setAllocations((prev) =>
                      prev.map((a, idx) =>
                        idx === i ? { ...a, targetIndex: parseInt(v) } : a
                      )
                    );
                  }}
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {node && (
                      <SelectItem value={String(node.index)}>
                        {node.emoji} {node.name}
                      </SelectItem>
                    )}
                    {availableNodes.map((n) => (
                      <SelectItem key={n.index} value={String(n.index)}>
                        {n.emoji} {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Slider
                  value={[alloc.percentage]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => handleWeightChange(i, v)}
                  className="flex-1"
                />

                <Input
                  type="number"
                  value={alloc.percentage}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) handleWeightChange(i, Math.max(0, Math.min(100, v)));
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
          {availableNodes.length > 0 && (
            <Select onValueChange={handleAdd}>
              <SelectTrigger className="h-7 text-xs text-muted-foreground">
                <SelectValue placeholder="+ Add allocation..." />
              </SelectTrigger>
              <SelectContent>
                {availableNodes.map((n) => (
                  <SelectItem key={n.index} value={String(n.index)}>
                    {n.emoji} {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isSuccess && (
            <p className="text-sm text-green-500 text-center">Allocations saved!</p>
          )}
          {error && (
            <p className="text-sm text-destructive text-center truncate">
              {error.message?.slice(0, 120) ?? "Transaction failed"}
            </p>
          )}

          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs flex-1"
              onClick={handleNormalize}
              disabled={allocations.length === 0 || isSubmitting}
            >
              Normalize 100%
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs flex-1"
              onClick={handleSubmit}
              disabled={allocations.length === 0 || sum !== 100 || isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save On-Chain"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
