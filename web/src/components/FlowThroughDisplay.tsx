"use client";

interface FlowThroughDisplayProps {
  flowThrough: number;  // total WAD-converted USD that flowed through
  balance: number;      // current balance
  threshold: number;    // max threshold
}

export default function FlowThroughDisplay({
  flowThrough,
  balance,
  threshold,
}: FlowThroughDisplayProps) {
  const retained = Math.min(balance, threshold);
  const continued = flowThrough;

  if (flowThrough === 0 && balance <= threshold) {
    return (
      <span className="text-xs text-muted-foreground">
        No flow-through yet
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground font-mono tabular-nums">
      <span title="Total flowed through">
        ${Math.round(continued).toLocaleString()} flowed
      </span>
      {" | "}
      <span title="Currently retained">
        ${Math.round(retained).toLocaleString()} retained
      </span>
    </span>
  );
}
