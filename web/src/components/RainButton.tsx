"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRain, type RainStep } from "@/lib/hooks/useRain";

const STEP_TEXT: Record<RainStep, string> = {
  idle: "Rain",
  approving: "Approving...",
  raining: "Raining...",
  done: "Done!",
  error: "Error",
};

export default function RainButton() {
  const [amount, setAmount] = useState(1000);
  const { rain, step, error, reset } = useRain();

  const isActive = step === "approving" || step === "raining";

  async function handleRain() {
    if (step === "error") {
      reset();
      return;
    }
    if (step === "done") {
      reset();
      return;
    }
    await rain(amount);
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">$</span>
      <Input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
        className="h-7 w-20 text-xs"
        min={1}
        disabled={isActive}
      />
      <Button
        size="sm"
        variant={step === "error" ? "destructive" : "outline"}
        className="h-7 text-xs"
        onClick={handleRain}
        disabled={isActive || amount <= 0}
        title={error ?? undefined}
      >
        {STEP_TEXT[step]}
      </Button>
    </div>
  );
}
