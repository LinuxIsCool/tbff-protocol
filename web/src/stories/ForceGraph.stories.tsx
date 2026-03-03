import type { Meta, StoryObj } from "@storybook/react";
import ForceGraph from "@/components/simulation/ForceGraph";
import { runMonthlySimulation, computeCumulativeTransfers } from "@/lib/simulation/simulation-engine";
import { initialParticipants } from "@/lib/simulation/initial-participants";
import type { FundingStream } from "@/lib/simulation/types";

const meta: Meta<typeof ForceGraph> = {
  title: "Simulation/ForceGraph",
  component: ForceGraph,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Base simulation with no funding
const baseResult = runMonthlySimulation(initialParticipants, [], "2026-01", "2028-01");

export const Default: Story = {
  render: () => (
    <ForceGraph
      participants={initialParticipants}
      snapshot={baseResult.snapshots[0]}
      cumulativeTransfers={computeCumulativeTransfers(baseResult.snapshots, 0)}
      selectedNodeId={null}
      onNodeClick={() => {}}
      width={800}
      height={600}
    />
  ),
};

export const WithSelectedNode: Story = {
  render: () => (
    <ForceGraph
      participants={initialParticipants}
      snapshot={baseResult.snapshots[0]}
      cumulativeTransfers={computeCumulativeTransfers(baseResult.snapshots, 0)}
      selectedNodeId="christina"
      onNodeClick={() => {}}
      width={800}
      height={600}
    />
  ),
};

// With funding streams — more activity
const streams: FundingStream[] = [
  {
    id: "grant",
    targetId: "*",
    amountPerMonth: 5000,
    startMonth: "2026-01",
    endMonth: "2028-01",
  },
];
const fundedResult = runMonthlySimulation(initialParticipants, streams, "2026-01", "2028-01");

export const WithFunding: Story = {
  render: () => (
    <ForceGraph
      participants={initialParticipants}
      snapshot={fundedResult.snapshots[12]}
      cumulativeTransfers={computeCumulativeTransfers(fundedResult.snapshots, 12)}
      selectedNodeId={null}
      onNodeClick={() => {}}
      width={800}
      height={600}
    />
  ),
};

export const LateMonth: Story = {
  render: () => (
    <ForceGraph
      participants={initialParticipants}
      snapshot={fundedResult.snapshots[23]}
      cumulativeTransfers={computeCumulativeTransfers(fundedResult.snapshots, 23)}
      selectedNodeId={null}
      onNodeClick={() => {}}
      width={800}
      height={600}
    />
  ),
};
