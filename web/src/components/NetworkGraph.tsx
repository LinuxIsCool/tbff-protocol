"use client";

import type { Participant } from "@/lib/tbff/engine";

interface NetworkGraphProps {
  participants: Participant[];
  currentValues?: Record<string, number>;
}

function getNodeColor(value: number, maxThreshold: number): string {
  if (value > maxThreshold) return "#ef4444"; // red: overflowing
  if (value > maxThreshold * 0.8) return "#eab308"; // yellow: approaching
  return "#22c55e"; // green: healthy
}

export default function NetworkGraph({ participants, currentValues }: NetworkGraphProps) {
  const n = participants.length;
  if (n === 0) return null;

  const width = 600;
  const height = 500;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;

  // Position nodes in a circle
  const positions = participants.map((_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  // Build index map
  const idxMap = new Map(participants.map((p, i) => [p.id, i]));

  // Fix 8: Precompute node radii once
  const maxThresh = Math.max(...participants.map((p) => p.maxThreshold));
  const minNodeR = 20;
  const maxNodeR = 40;
  const nodeRadii = participants.map(
    (p) => minNodeR + (p.maxThreshold / maxThresh) * (maxNodeR - minNodeR)
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
        </marker>
      </defs>

      {/* Edges */}
      {participants.map((p, i) =>
        p.allocations.map((alloc) => {
          const j = idxMap.get(alloc.target);
          if (j === undefined) return null;
          const src = positions[i];
          const tgt = positions[j];

          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const nx = -dy / len;
          const ny = dx / len;
          const curve = 20;
          const midX = (src.x + tgt.x) / 2 + nx * curve;
          const midY = (src.y + tgt.y) / 2 + ny * curve;

          const ratio = nodeRadii[i] / len;
          const tgtRatio = nodeRadii[j] / len;
          const sx = src.x + dx * ratio;
          const sy = src.y + dy * ratio;
          const tx = tgt.x - dx * tgtRatio;
          const ty = tgt.y - dy * tgtRatio;

          return (
            <path
              key={`${p.id}-${alloc.target}`}
              d={`M ${sx} ${sy} Q ${midX} ${midY} ${tx} ${ty}`}
              fill="none"
              stroke="#64748b"
              strokeWidth={Math.max(1, alloc.weight * 3)}
              strokeOpacity={0.5}
              markerEnd="url(#arrowhead)"
            />
          );
        })
      )}

      {/* Nodes */}
      {participants.map((p, i) => {
        const pos = positions[i];
        const bal = currentValues?.[p.id] ?? p.value;
        const r = nodeRadii[i];
        const color = getNodeColor(bal, p.maxThreshold);

        return (
          <g key={p.id}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={r}
              fill={color}
              fillOpacity={0.2}
              stroke={color}
              strokeWidth={2}
            />
            <text
              x={pos.x}
              y={pos.y - 6}
              textAnchor="middle"
              fontSize="16"
              fill="currentColor"
            >
              {p.emoji}
            </text>
            <text
              x={pos.x}
              y={pos.y + 10}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              className="font-medium"
            >
              {p.name}
            </text>
            <text
              x={pos.x}
              y={pos.y + r + 14}
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              ${Math.round(bal).toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
