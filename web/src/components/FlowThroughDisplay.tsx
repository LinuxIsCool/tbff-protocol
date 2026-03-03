"use client";

interface FlowThroughDisplayProps {
  overflow: number;     // cumulative overflow routed through this node (USD)
  balance: number;      // current balance
  threshold: number;    // max threshold
}

export default function FlowThroughDisplay({
  overflow,
  balance,
  threshold,
}: FlowThroughDisplayProps) {
  const retained = Math.min(balance, threshold);

  if (overflow === 0 && balance <= threshold) {
    return (
      <span className="text-xs text-muted-foreground">
        No overflow yet
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground font-mono tabular-nums">
      <span title="Cumulative overflow routed">
        ${Math.round(overflow).toLocaleString()} overflow
      </span>
      {" | "}
      <span title="Currently retained">
        ${Math.round(retained).toLocaleString()} retained
      </span>
    </span>
  );
}
