"use client";

interface FlowThroughDisplayProps {
  overflow: number;     // cumulative overflow routed through this node (USD)
  value: number;        // current value (balance or rate)
  threshold: number;    // max threshold
}

export default function FlowThroughDisplay({
  overflow,
  value,
  threshold,
}: FlowThroughDisplayProps) {
  const retained = Math.min(value, threshold);

  if (overflow === 0 && value <= threshold) {
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
