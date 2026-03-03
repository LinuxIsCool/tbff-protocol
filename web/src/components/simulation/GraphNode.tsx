"use client";

import type { GraphNode as GraphNodeType } from "@/lib/simulation/types";

interface GraphNodeProps {
  node: GraphNodeType;
  selected: boolean;
  onClick: () => void;
}

export default function GraphNode({ node, selected, onClick }: GraphNodeProps) {
  const { fillRadius, borderWidth, fillAlpha, borderAlpha, color, isLocked, emoji, label } = node;
  const totalRadius = fillRadius + borderWidth;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Selection ring */}
      {selected && (
        <circle
          r={totalRadius + 4}
          fill="none"
          stroke="white"
          strokeWidth={2}
          opacity={0.6}
        />
      )}

      {/* Border circle — maxThreshold encoding */}
      <circle
        r={totalRadius}
        fill={color}
        opacity={borderAlpha * 0.3}
        stroke={color}
        strokeWidth={borderWidth}
        strokeOpacity={borderAlpha}
      />

      {/* Fill circle — minThreshold encoding */}
      <circle
        r={fillRadius}
        fill={color}
        opacity={fillAlpha * 0.7 + 0.1}
      />

      {/* Lock indicator */}
      {isLocked && (
        <text
          y={-fillRadius - 8}
          textAnchor="middle"
          fontSize={14}
          aria-label="Locked"
        >
          🔒
        </text>
      )}

      {/* Emoji */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.max(16, fillRadius * 0.6)}
        style={{ pointerEvents: "none" }}
      >
        {emoji}
      </text>

      {/* Name label */}
      <text
        y={totalRadius + 16}
        textAnchor="middle"
        fill="white"
        fontSize={12}
        opacity={0.8}
        style={{ pointerEvents: "none" }}
      >
        {label}
      </text>
    </g>
  );
}
