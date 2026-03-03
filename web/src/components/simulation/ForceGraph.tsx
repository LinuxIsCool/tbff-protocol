"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type {
  SimParticipant,
  MonthlySnapshot,
  GraphNode as GraphNodeType,
  GraphEdge as GraphEdgeType,
} from "@/lib/simulation/types";
import {
  computeNodeGeometry,
  computeEdgeGeometry,
} from "@/lib/simulation/graph-geometry";
import GraphNodeComponent from "./GraphNode";
import GraphEdgeComponent from "./GraphEdge";

// ─── D3 Node type ───────────────────────────────────────────

interface D3Node extends SimulationNodeDatum {
  id: string;
}

interface D3Link extends SimulationLinkDatum<D3Node> {
  source: string;
  target: string;
}

// ─── Props ──────────────────────────────────────────────────

interface ForceGraphProps {
  participants: SimParticipant[];
  snapshot: MonthlySnapshot;
  cumulativeTransfers: Record<string, Record<string, number>>;
  selectedNodeId: string | null;
  onNodeClick: (id: string) => void;
  width: number;
  height: number;
}

export default function ForceGraph({
  participants,
  snapshot,
  cumulativeTransfers,
  selectedNodeId,
  onNodeClick,
  width,
  height,
}: ForceGraphProps) {
  const simulationRef = useRef<ReturnType<typeof forceSimulation<D3Node>> | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const rafRef = useRef<number>(0);
  const [renderTick, setRenderTick] = useState(0);

  // Stable participant IDs for topology change detection
  const topologyKey = useMemo(
    () =>
      participants
        .map((p) => `${p.id}:${p.allocations.map((a) => a.target).join(",")}`)
        .join("|"),
    [participants]
  );

  // Initialize / restart D3 simulation on topology change
  useEffect(() => {
    const nodes: D3Node[] = participants.map((p) => {
      const prev = positionsRef.current.get(p.id);
      return {
        id: p.id,
        x: prev?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: prev?.y ?? height / 2 + (Math.random() - 0.5) * 100,
      };
    });

    const links: D3Link[] = [];
    for (const p of participants) {
      for (const a of p.allocations) {
        links.push({ source: p.id, target: a.target });
      }
    }

    const sim = forceSimulation<D3Node>(nodes)
      .force(
        "link",
        forceLink<D3Node, D3Link>(links)
          .id((d) => d.id)
          .distance(120)
          .strength(0.3)
      )
      .force("charge", forceManyBody().strength(-400))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<D3Node>().radius(60))
      .alpha(0.3)
      .alphaDecay(0.02);

    simulationRef.current = sim;

    // RAF loop: read D3 positions → trigger React render
    const tick = () => {
      for (const node of sim.nodes()) {
        positionsRef.current.set(node.id, {
          x: node.x ?? 0,
          y: node.y ?? 0,
        });
      }
      setRenderTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      sim.stop();
    };
  }, [topologyKey, width, height, participants]);

  // ─── Derive visual data from current snapshot + positions ──

  const allMinThresholds = participants.map((p) => p.minThreshold);
  const allMaxThresholds = participants.map((p) => p.maxThreshold);

  // Max flows for edge normalization
  let maxMonthlyFlow = 0;
  let maxCumulativeFlow = 0;
  for (const t of snapshot.transfers) {
    maxMonthlyFlow = Math.max(maxMonthlyFlow, t.amount);
  }
  for (const fromMap of Object.values(cumulativeTransfers)) {
    for (const amt of Object.values(fromMap)) {
      maxCumulativeFlow = Math.max(maxCumulativeFlow, amt);
    }
  }

  // Build monthly flow lookup (aggregate all iterations)
  const monthlyFlows: Record<string, Record<string, number>> = {};
  for (const t of snapshot.transfers) {
    if (!monthlyFlows[t.from]) monthlyFlows[t.from] = {};
    monthlyFlows[t.from][t.to] = (monthlyFlows[t.from][t.to] ?? 0) + t.amount;
  }

  const graphNodes: GraphNodeType[] = participants.map((p) => {
    const pos = positionsRef.current.get(p.id) ?? { x: width / 2, y: height / 2 };
    const state = snapshot.nodeStates[p.id];
    const geo = computeNodeGeometry(p, state, allMinThresholds, allMaxThresholds);
    return { ...geo, x: pos.x, y: pos.y };
  });

  const graphEdges: GraphEdgeType[] = [];
  for (const p of participants) {
    for (const a of p.allocations) {
      const monthly = monthlyFlows[p.id]?.[a.target] ?? 0;
      const cumulative = cumulativeTransfers[p.id]?.[a.target] ?? 0;

      graphEdges.push(
        computeEdgeGeometry(
          p.id,
          a.target,
          a.weight,
          monthly,
          cumulative,
          maxMonthlyFlow,
          maxCumulativeFlow,
          p.color
        )
      );
    }
  }

  const posMap = Object.fromEntries(
    graphNodes.map((n) => [n.id, { x: n.x, y: n.y }])
  );

  // Suppress unused-variable warning for renderTick (drives re-renders)
  void renderTick;

  return (
    <svg
      width={width}
      height={height}
      className="bg-background"
      style={{ touchAction: "none" }}
    >
      {/* Edges first (under nodes) */}
      {graphEdges.map((edge) => (
        <GraphEdgeComponent
          key={`${edge.source}-${edge.target}`}
          edge={edge}
          sourcePos={posMap[edge.source] ?? { x: 0, y: 0 }}
          targetPos={posMap[edge.target] ?? { x: 0, y: 0 }}
        />
      ))}

      {/* Nodes on top */}
      {graphNodes.map((node) => (
        <GraphNodeComponent
          key={node.id}
          node={node}
          selected={node.id === selectedNodeId}
          onClick={() => onNodeClick(node.id)}
        />
      ))}
    </svg>
  );
}
