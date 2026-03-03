"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { monthLabel } from "@/lib/simulation/months";

interface TimelineScrubberProps {
  months: string[]; // all month keys
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function TimelineScrubber({
  months,
  selectedIndex,
  onSelect,
}: TimelineScrubberProps) {
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      onSelect(selectedIndex >= months.length - 1 ? 0 : selectedIndex + 1);
    }, 800);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, selectedIndex, months.length, onSelect]);

  // Tick labels at 3-month intervals
  const tickIndices: number[] = [];
  for (let i = 0; i < months.length; i += 3) {
    tickIndices.push(i);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0 shrink-0"
        onClick={togglePlay}
      >
        {playing ? "⏸" : "▶"}
      </Button>

      <div className="flex-1 space-y-1">
        <Slider
          value={[selectedIndex]}
          min={0}
          max={months.length - 1}
          step={1}
          onValueChange={([v]) => onSelect(v)}
        />

        <div className="relative h-4">
          {tickIndices.map((i) => (
            <span
              key={i}
              className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
              style={{ left: `${(i / Math.max(1, months.length - 1)) * 100}%` }}
            >
              {monthLabel(months[i]).slice(0, 3)}
            </span>
          ))}
        </div>
      </div>

      <span className="text-sm font-medium text-foreground w-24 text-right shrink-0">
        {months[selectedIndex] ? monthLabel(months[selectedIndex]) : "—"}
      </span>
    </div>
  );
}
