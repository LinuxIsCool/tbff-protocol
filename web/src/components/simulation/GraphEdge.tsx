"use client";

import type { GraphEdge as GraphEdgeType } from "@/lib/simulation/types";

interface GraphEdgeProps {
  edge: GraphEdgeType;
  sourcePos: { x: number; y: number };
  targetPos: { x: number; y: number };
}

export default function GraphEdge({ edge, sourcePos, targetPos }: GraphEdgeProps) {
  const { width, fillAlpha, strokeAlpha, color } = edge;

  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1) return null;

  // Arrowhead offset from target center
  const arrowSize = width * 2 + 4;
  const nx = dx / len;
  const ny = dy / len;
  const endX = targetPos.x - nx * 30; // offset from node center
  const endY = targetPos.y - ny * 30;
  const startX = sourcePos.x + nx * 30;
  const startY = sourcePos.y + ny * 30;

  // Arrow tip points
  const tipX = endX;
  const tipY = endY;
  const baseX = endX - nx * arrowSize;
  const baseY = endY - ny * arrowSize;
  const perpX = -ny * arrowSize * 0.4;
  const perpY = nx * arrowSize * 0.4;

  return (
    <g>
      {/* Outer stroke — monthly flow encoding */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={width + 2}
        strokeOpacity={strokeAlpha * 0.5}
        strokeLinecap="round"
      />

      {/* Inner fill — cumulative flow encoding */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={width}
        strokeOpacity={fillAlpha}
        strokeLinecap="round"
      />

      {/* Arrowhead */}
      <polygon
        points={`${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`}
        fill={color}
        opacity={fillAlpha}
      />
    </g>
  );
}
