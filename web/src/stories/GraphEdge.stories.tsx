import type { Meta, StoryObj } from "@storybook/react";
import GraphEdge from "@/components/simulation/GraphEdge";
import type { GraphEdge as GraphEdgeType } from "@/lib/simulation/types";

function Wrapper({ edges }: { edges: { edge: GraphEdgeType; src: { x: number; y: number }; tgt: { x: number; y: number } }[] }) {
  return (
    <svg width={600} height={300} style={{ background: "hsl(240 10% 3.9%)" }}>
      {edges.map((e, i) => (
        <GraphEdge
          key={i}
          edge={e.edge}
          sourcePos={e.src}
          targetPos={e.tgt}
        />
      ))}
      {/* Reference dots */}
      {edges.map((e, i) => (
        <g key={`dots-${i}`}>
          <circle cx={e.src.x} cy={e.src.y} r={4} fill="white" opacity={0.5} />
          <circle cx={e.tgt.x} cy={e.tgt.y} r={4} fill="white" opacity={0.5} />
        </g>
      ))}
    </svg>
  );
}

const meta: Meta<typeof GraphEdge> = {
  title: "Simulation/GraphEdge",
  component: GraphEdge,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const LightFlow: Story = {
  render: () => (
    <Wrapper
      edges={[
        {
          edge: {
            source: "a",
            target: "b",
            width: 2,
            fillAlpha: 0.2,
            strokeAlpha: 0.1,
            color: "hsl(160, 70%, 55%)",
          },
          src: { x: 100, y: 150 },
          tgt: { x: 500, y: 150 },
        },
      ]}
    />
  ),
};

export const HeavyFlow: Story = {
  render: () => (
    <Wrapper
      edges={[
        {
          edge: {
            source: "a",
            target: "b",
            width: 5,
            fillAlpha: 0.9,
            strokeAlpha: 0.8,
            color: "hsl(220, 75%, 60%)",
          },
          src: { x: 100, y: 150 },
          tgt: { x: 500, y: 150 },
        },
      ]}
    />
  ),
};

export const MultipleEdges: Story = {
  render: () => (
    <Wrapper
      edges={[
        {
          edge: { source: "a", target: "b", width: 3, fillAlpha: 0.6, strokeAlpha: 0.4, color: "hsl(160, 70%, 55%)" },
          src: { x: 100, y: 80 },
          tgt: { x: 500, y: 80 },
        },
        {
          edge: { source: "c", target: "d", width: 4, fillAlpha: 0.8, strokeAlpha: 0.7, color: "hsl(35, 85%, 55%)" },
          src: { x: 100, y: 150 },
          tgt: { x: 500, y: 150 },
        },
        {
          edge: { source: "e", target: "f", width: 1.5, fillAlpha: 0.3, strokeAlpha: 0.2, color: "hsl(340, 75%, 60%)" },
          src: { x: 100, y: 220 },
          tgt: { x: 500, y: 220 },
        },
      ]}
    />
  ),
};
