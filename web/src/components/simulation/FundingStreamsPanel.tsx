"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SimParticipant, FundingStream } from "@/lib/simulation/types";

interface FundingStreamsPanelProps {
  participants: SimParticipant[];
  fundingStreams: FundingStream[];
  onStreamsChange: (streams: FundingStream[]) => void;
  startMonth: string;
  endMonth: string;
}

let nextStreamId = 1;

export default function FundingStreamsPanel({
  participants,
  fundingStreams,
  onStreamsChange,
  startMonth,
  endMonth,
}: FundingStreamsPanelProps) {
  const handleAdd = useCallback(() => {
    const newStream: FundingStream = {
      id: `stream-${nextStreamId++}`,
      targetId: participants[0]?.id ?? "",
      amountPerMonth: 1000,
      startMonth,
      endMonth,
    };
    onStreamsChange([...fundingStreams, newStream]);
  }, [fundingStreams, onStreamsChange, participants, startMonth, endMonth]);

  const handleRemove = useCallback(
    (id: string) => {
      onStreamsChange(fundingStreams.filter((s) => s.id !== id));
    },
    [fundingStreams, onStreamsChange]
  );

  const handleUpdate = useCallback(
    (id: string, updates: Partial<FundingStream>) => {
      onStreamsChange(
        fundingStreams.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    [fundingStreams, onStreamsChange]
  );

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Funding Streams</h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAdd}>
          + Add
        </Button>
      </div>

      {fundingStreams.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No funding streams. Add one to inject external funds.
        </p>
      )}

      {fundingStreams.map((stream) => (
        <div
          key={stream.id}
          className="rounded-md border border-border p-2 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Select
              value={stream.targetId}
              onValueChange={(v) => handleUpdate(stream.id, { targetId: v })}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="*">Everyone</SelectItem>
                {participants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
              onClick={() => handleRemove(stream.id)}
            >
              x
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-6">$/m</span>
            <Input
              type="number"
              value={stream.amountPerMonth}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0)
                  handleUpdate(stream.id, { amountPerMonth: v });
              }}
              className="h-7 text-xs flex-1"
              min={0}
              step={100}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
