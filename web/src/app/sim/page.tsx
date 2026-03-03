"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { runMonthlySimulation, computeCumulativeTransfers } from "@/lib/simulation/simulation-engine";
import { generateMonthKeys } from "@/lib/simulation/months";
import { initialParticipants } from "@/lib/simulation/initial-participants";
import type { SimParticipant, FundingStream } from "@/lib/simulation/types";
import FundingStreamsPanel from "@/components/simulation/FundingStreamsPanel";
import TimelineScrubber from "@/components/simulation/TimelineScrubber";
import NodeDetailPanel from "@/components/simulation/NodeDetailPanel";

const ForceGraph = dynamic(
  () => import("@/components/simulation/ForceGraph"),
  { ssr: false }
);

const START_MONTH = "2026-01";
const END_MONTH = "2028-01";

export default function SimPage() {
  const [participants, setParticipants] = useState<SimParticipant[]>(initialParticipants);
  const [fundingStreams, setFundingStreams] = useState<FundingStream[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Graph container sizing
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 600, height: 500 });

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setGraphSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Simulation
  const simulationResult = useMemo(
    () => runMonthlySimulation(participants, fundingStreams, START_MONTH, END_MONTH),
    [participants, fundingStreams]
  );

  const monthKeys = useMemo(
    () => generateMonthKeys(START_MONTH, END_MONTH),
    []
  );

  const currentSnapshot = simulationResult.snapshots[selectedMonth];

  const cumulativeTransfers = useMemo(
    () => computeCumulativeTransfers(simulationResult.snapshots, selectedMonth),
    [simulationResult, selectedMonth]
  );

  // Handlers
  const handleNodeClick = useCallback((id: string) => {
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }, []);

  const handleThresholdChange = useCallback(
    (id: string, field: "minThreshold" | "maxThreshold", value: number) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
    },
    []
  );

  const selectedParticipant = selectedNodeId
    ? participants.find((p) => p.id === selectedNodeId) ?? null
    : null;

  if (!currentSnapshot) return null;

  return (
    <div className="dark h-screen flex flex-col bg-background text-foreground">
      {/* Main content */}
      <div className="flex-1 grid grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_320px] min-h-0">
        {/* Left panel — Funding Streams */}
        <div className="border-r border-border overflow-hidden">
          <FundingStreamsPanel
            participants={participants}
            fundingStreams={fundingStreams}
            onStreamsChange={setFundingStreams}
            startMonth={START_MONTH}
            endMonth={END_MONTH}
          />
        </div>

        {/* Center — Force Graph */}
        <div ref={graphContainerRef} className="overflow-hidden">
          <ForceGraph
            participants={participants}
            snapshot={currentSnapshot}
            cumulativeTransfers={cumulativeTransfers}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
            width={graphSize.width}
            height={graphSize.height}
          />
        </div>

        {/* Right panel — Node Detail (lg+ only) */}
        <div className="hidden lg:block border-l border-border overflow-hidden">
          {selectedParticipant ? (
            <NodeDetailPanel
              participant={selectedParticipant}
              snapshot={currentSnapshot}
              simulationResult={simulationResult}
              selectedMonth={selectedMonth}
              onThresholdChange={handleThresholdChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Click a node to inspect
            </div>
          )}
        </div>
      </div>

      {/* Bottom — Timeline */}
      <div className="border-t border-border shrink-0">
        <TimelineScrubber
          months={monthKeys}
          selectedIndex={selectedMonth}
          onSelect={setSelectedMonth}
        />
      </div>
    </div>
  );
}
