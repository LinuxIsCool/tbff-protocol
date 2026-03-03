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
  // Nature & plants
  "\u{1F33F}", "\u{1F332}", "\u{1F33B}", "\u{1F33E}", "\u{1F341}",
  "\u{1F335}", "\u{1F340}", "\u{1F490}",
  // Tools & tech
  "\u{1F527}", "\u{2699}\u{FE0F}", "\u{1F4BB}", "\u{1F4A1}", "\u{1F50C}",
  // Energy & elements
  "\u{26A1}", "\u{1F525}", "\u{1F30A}", "\u{2744}\u{FE0F}", "\u{2728}",
  // Space & science
  "\u{1F680}", "\u{1F30D}", "\u{1F310}", "\u{2B50}", "\u{1F319}",
  // Building & craft
  "\u{1F3D7}\u{FE0F}", "\u{1F3AF}", "\u{1F3A8}", "\u{1F9E9}",
  // People & community
  "\u{1F91D}", "\u{1F9EC}", "\u{1F3B5}", "\u{1F4DA}",
  // Animals
  "\u{1F41D}", "\u{1F98B}", "\u{1F40C}", "\u{1F419}",
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
  const [maxThreshold, setMaxThreshold] = useState(8000);
  const [minThreshold, setMinThreshold] = useState(3000);

  const { register, step, error, reset } = useRegister();

  const isSubmitting = step === "granting" || step === "registering";
  const canSubmit = name.trim().length > 0 && !isSubmitting;

  async function handleSubmit() {
    await register(maxThreshold, minThreshold, name.trim(), emoji, role.trim() || "Participant");

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

  function handleMaxThresholdInput(value: string) {
    const num = parseInt(value.replace(/[^0-9]/g, ""));
    if (!isNaN(num)) {
      const clamped = Math.max(1000, Math.min(50000, num));
      setMaxThreshold(clamped);
      if (minThreshold > clamped) setMinThreshold(clamped);
    }
  }

  function handleMinThresholdInput(value: string) {
    const num = parseInt(value.replace(/[^0-9]/g, ""));
    if (!isNaN(num)) {
      setMinThreshold(Math.max(0, Math.min(Math.min(20000, maxThreshold), num)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Join Network</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">Join the Network</DialogTitle>
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
              className="h-8 text-foreground"
            />
          </div>

          {/* Emoji picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Emoji <span className="text-foreground ml-1">{emoji}</span>
            </label>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 border border-border rounded-md bg-muted/30">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`h-8 w-8 rounded text-lg flex items-center justify-center transition-colors ${
                    emoji === e
                      ? "bg-primary text-primary-foreground ring-1 ring-ring"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => setEmoji(e)}
                  disabled={isSubmitting}
                >
                  {e}
                </button>
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
              className="h-8 text-foreground"
            />
          </div>

          {/* Max Threshold */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Max threshold (overflow above this flows out)
            </label>
            <div className="flex items-center gap-3">
              <Slider
                value={[maxThreshold]}
                min={1000}
                max={50000}
                step={1000}
                onValueChange={([v]) => {
                  setMaxThreshold(v);
                  if (minThreshold > v) setMinThreshold(v);
                }}
                disabled={isSubmitting}
                className="flex-1"
              />
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="text"
                  value={maxThreshold.toLocaleString()}
                  onChange={(e) => handleMaxThresholdInput(e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 w-20 text-xs text-right font-mono text-foreground"
                />
                <span className="text-[10px] text-muted-foreground">/mo</span>
              </div>
            </div>
          </div>

          {/* Min Threshold */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Min threshold (hold everything below this)
            </label>
            <div className="flex items-center gap-3">
              <Slider
                value={[minThreshold]}
                min={0}
                max={Math.min(20000, maxThreshold)}
                step={500}
                onValueChange={([v]) => setMinThreshold(v)}
                disabled={isSubmitting}
                className="flex-1"
              />
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="text"
                  value={minThreshold.toLocaleString()}
                  onChange={(e) => handleMinThresholdInput(e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 w-20 text-xs text-right font-mono text-foreground"
                />
                <span className="text-[10px] text-muted-foreground">/mo</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Below min: hold all. Between min & max: active, no overflow. Above max: overflow redistributed.
            </p>
          </div>

          {/* Status */}
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
