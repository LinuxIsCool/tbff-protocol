"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRegister, type RegistrationStep } from "@/lib/hooks/useRegister";

const EMOJI_OPTIONS = [
  "\u{1F33F}", // herb
  "\u{1F527}", // wrench
  "\u{26A1}",  // lightning
  "\u{1F3D7}\u{FE0F}", // building construction
  "\u{1F310}", // globe
  "\u{1F332}", // evergreen tree
  "\u{1F525}", // fire
  "\u{1F4A1}", // light bulb
  "\u{1F680}", // rocket
  "\u{2728}",  // sparkles
  "\u{1F30A}", // wave
  "\u{1F33B}", // sunflower
];

const STEP_LABELS: Record<RegistrationStep, string> = {
  idle: "",
  granting: "Step 1 of 2: Authorizing...",
  registering: "Step 2 of 2: Registering...",
  done: "Welcome to the network!",
  error: "Something went wrong",
};

export default function RegistrationFlow() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [role, setRole] = useState("");
  const [threshold, setThreshold] = useState(8000);

  const { register, step, error, reset } = useRegister();

  const isSubmitting = step === "granting" || step === "registering";
  const canSubmit = name.trim().length > 0 && !isSubmitting;

  async function handleSubmit() {
    await register(threshold, name.trim(), emoji, role.trim() || "Participant");

    // Auto-close on success after brief display
    setTimeout(() => {
      setOpen(false);
      reset();
    }, 2000);
  }

  function handleOpenChange(next: boolean) {
    if (!isSubmitting) {
      setOpen(next);
      if (!next) reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Join Network</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join the Network</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={64}
              disabled={isSubmitting}
              className="h-8"
            />
          </div>

          {/* Emoji picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Emoji</label>
            <div className="flex flex-wrap gap-1">
              {EMOJI_OPTIONS.map((e) => (
                <Button
                  key={e}
                  variant={emoji === e ? "default" : "outline"}
                  size="sm"
                  className="h-8 w-8 p-0 text-base"
                  onClick={() => setEmoji(e)}
                  disabled={isSubmitting}
                >
                  {e}
                </Button>
              ))}
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Developer, Designer, Researcher"
              maxLength={128}
              disabled={isSubmitting}
              className="h-8"
            />
          </div>

          {/* Threshold slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-muted-foreground">Threshold</span>
              <span className="font-mono">${threshold.toLocaleString()}</span>
            </div>
            <Slider
              value={[threshold]}
              min={1000}
              max={50000}
              step={1000}
              onValueChange={([v]) => setThreshold(v)}
              disabled={isSubmitting}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>$1,000</span>
              <span>$50,000</span>
            </div>
          </div>

          {/* Status / Progress */}
          {step !== "idle" && (
            <div
              className={`text-sm text-center py-1 ${
                step === "done"
                  ? "text-green-500"
                  : step === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {STEP_LABELS[step]}
              {error && (
                <p className="text-xs mt-1 truncate">{error.slice(0, 120)}</p>
              )}
            </div>
          )}

          {/* Actions */}
          {step === "error" ? (
            <Button onClick={reset} variant="outline" className="w-full">
              Retry
            </Button>
          ) : step !== "done" ? (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {isSubmitting ? "Processing..." : "Join Network"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
