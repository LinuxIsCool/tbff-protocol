import type { Preview } from "@storybook/react";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "hsl(240 10% 3.9%)" },
        { name: "light", value: "hsl(0 0% 100%)" },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="dark" style={{ padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
