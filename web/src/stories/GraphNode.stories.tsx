import type { Meta, StoryObj } from "@storybook/react";
import GraphNode from "@/components/simulation/GraphNode";
import type { GraphNode as GraphNodeType } from "@/lib/simulation/types";

const baseNode: GraphNodeType = {
  id: "shawn",
  x: 200,
  y: 200,
  fillRadius: 35,
  borderWidth: 4,
  fillAlpha: 0.8,
  borderAlpha: 0.6,
  color: "hsl(160, 70%, 55%)",
  isLocked: false,
  label: "Shawn",
  emoji: "🌲",
};

function Wrapper({ node, selected }: { node: GraphNodeType; selected: boolean }) {
  return (
    <svg width={400} height={400} style={{ background: "hsl(240 10% 3.9%)" }}>
      <GraphNode node={node} selected={selected} onClick={() => {}} />
    </svg>
  );
}

const meta: Meta<typeof GraphNode> = {
  title: "Simulation/GraphNode",
  component: GraphNode,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Funded: Story = {
  render: () => <Wrapper node={baseNode} selected={false} />,
};

export const Selected: Story = {
  render: () => <Wrapper node={baseNode} selected={true} />,
};

export const Underfunded: Story = {
  render: () => (
    <Wrapper
      node={{ ...baseNode, fillAlpha: 0.3, borderAlpha: 0.2 }}
      selected={false}
    />
  ),
};

export const Locked: Story = {
  render: () => (
    <Wrapper
      node={{ ...baseNode, isLocked: true, fillAlpha: 0.2, borderAlpha: 0.1 }}
      selected={false}
    />
  ),
};

export const Overflowing: Story = {
  render: () => (
    <Wrapper
      node={{ ...baseNode, fillAlpha: 1.0, borderAlpha: 1.0, borderWidth: 6 }}
      selected={false}
    />
  ),
};

export const AllParticipants: Story = {
  render: () => {
    const colors = [
      { color: "hsl(160, 70%, 55%)", emoji: "🌲", label: "Shawn" },
      { color: "hsl(220, 75%, 60%)", emoji: "🔧", label: "Jeff" },
      { color: "hsl(35, 85%, 55%)", emoji: "⚡", label: "Darren" },
      { color: "hsl(280, 65%, 60%)", emoji: "🏗️", label: "Simon" },
      { color: "hsl(340, 75%, 60%)", emoji: "🌐", label: "Christina" },
    ];

    return (
      <svg width={600} height={200} style={{ background: "hsl(240 10% 3.9%)" }}>
        {colors.map((c, i) => (
          <GraphNode
            key={c.label}
            node={{
              ...baseNode,
              id: c.label.toLowerCase(),
              x: 80 + i * 110,
              y: 100,
              color: c.color,
              emoji: c.emoji,
              label: c.label,
            }}
            selected={i === 0}
            onClick={() => {}}
          />
        ))}
      </svg>
    );
  },
};
