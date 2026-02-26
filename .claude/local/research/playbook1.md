# FlowFunding: 10-Phase Claude Code Build Playbook

> **Purpose:** A sequence of 10 self-contained prompts to pass to Claude Code, each building on the previous phase's output. Every phase produces working, testable, visually verifiable artifacts. Copy each prompt verbatim into a Claude Code session after completing the prior phase.
>
> **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, wagmi/viem, Superfluid SDK, D3.js, Vitest
>
> **Target:** Base L2 (Chain ID 8453) / Base Sepolia Testnet (Chain ID 84532)

---

## Phase 1 — Project Scaffold, Design System, and Water Tank Primitives

```
I am building a production application called "FlowFunding" — a threshold-based flow funding platform that runs on Base L2 using Superfluid streaming payments. This is Phase 1 of 10.

Create a Next.js 14 App Router project with TypeScript and Tailwind CSS. Set up the following:

PROJECT STRUCTURE:
- /app — Next.js app router pages
- /components/ui — Reusable design system primitives
- /components/views — Dashboard view components (empty shells for now)
- /lib/constants.ts — Design tokens, addresses, ABIs
- /lib/types.ts — Core TypeScript types
- /lib/tbff — TBFF algorithm implementation (placeholder)
- /lib/hooks — Custom React hooks
- /public — Static assets

DESIGN SYSTEM — Build these as polished, tested components:

1. Design tokens in constants.ts:
   - Dark palette: bg "#0a0f14", card "#111c26", border "#1a2d3d"
   - Accent: teal "#00e5a0", cyan "#00c8ff", warn "#ff6b4a", gold "#ffd700", purple "#a855f7"
   - Typography: "Outfit" for display, "JetBrains Mono" for data
   - Import fonts via next/font/google

2. WaterTank component (the signature visual):
   - SVG-based animated water level visualization
   - Props: value, min, max, capacity, label, size, accent color
   - Animated wave effect on the water surface using SVG animate
   - Dashed threshold lines for min (warn color) and max (cyan color)
   - Fill color changes based on state: below min = warn, operational = accent, overflow = cyan
   - Gentle bobbing animation on the water surface

3. StatCard component — label, value, subtitle, accent color
4. GlowButton component — primary (teal), ghost (bordered), secondary variants with hover glow
5. SliderInput component — custom styled range input with fill track, floating thumb, label showing formatted value
6. ProgressBar component — thin horizontal bar with configurable color and percentage

TYPES in types.ts:
```typescript
interface Participant {
  id: string;
  name: string;
  role: string;
  avatar: string;
  walletAddress?: string;
  minThreshold: number;    // $/month sustainability floor
  maxThreshold: number;    // $/month optimal ceiling
  currentFlow: number;     // $/month current inflow
  allocations: Record<string, number>;  // participantId -> percentage
}

interface NetworkState {
  participants: Participant[];
  totalInflow: number;
  totalDistributed: number;
  totalOverflow: number;
  giniCoefficient: number;
  minThresholdCoverage: number;
  convergenceIterations: number;
}

interface StreamEvent {
  id: string;
  timestamp: Date;
  type: 'inflow' | 'outflow' | 'threshold_change' | 'allocation_change' | 'redistribution' | 'join' | 'leave';
  participantId: string;
  message: string;
  amount?: number;
}
```

VALIDATION AND TESTING:
- Create /app/design-system/page.tsx — a visual test page that renders every component in multiple states:
  - WaterTank at 20% (below min), 60% (operational), 95% (near max), 120% (overflow)
  - All button variants, hover states
  - Sliders at various positions
  - StatCards with different accent colors
- Write Vitest unit tests for WaterTank percentage calculations, threshold state detection, and type guards
- The design system page must look stunning and work as a living style guide

The visual identity should feel like a control room for a living watershed — dark, atmospheric, with luminous teal data and gentle water animations. Not generic dashboard aesthetics. Every component should feel like it belongs in an interface that manages flowing water.
```

---

## Phase 2 — TBFF Algorithm Engine with Visual Convergence Debugger

```
This is Phase 2 of 10 for the FlowFunding app. Phase 1 created the design system and project scaffold.

Now implement the core TBFF (Threshold-Based Flow Funding) algorithm as a pure TypeScript library in /lib/tbff/, with a visual convergence debugger page for validation.

THE ALGORITHM — implement in /lib/tbff/engine.ts:

The core equation is: x^(k+1) = min(x^(k), t) + P^T · max(0, x^(k) - t)

Where:
- x^(k) is the vector of account flow rates at iteration k
- t is the vector of maximum thresholds
- P is the normalized allocation matrix (P[i][j] = what % of i's overflow goes to j)
- min and max are element-wise operations

Implementation requirements:
1. `redistributeFlows(participants: Participant[], totalInflow: number): RedistributionResult` — the main function
   - Phase A: Distribute inflow to meet minimum thresholds first (proportional if insufficient)
   - Phase B: Distribute remaining to fill min→max range proportionally
   - Phase C: Iterative overflow redistribution using the matrix equation until convergence
   - Convergence: stop when total overflow change < epsilon ($0.01) or max 50 iterations

2. `computeOverflow(participant: Participant): number` — max(0, currentFlow - maxThreshold)

3. `buildAllocationMatrix(participants: Participant[]): number[][]` — normalized P matrix from allocations

4. `computeNetworkMetrics(state: NetworkState): NetworkMetrics` — Gini coefficient, satisfaction ratios, min threshold coverage percentage, total shortfall, total overflow

5. `simulateWhatIf(currentState: NetworkState, proposedChange: Partial<Participant>): { before: NetworkState, after: NetworkState, diff: ParticipantDiff[] }` — preview the impact of a threshold or allocation change

Return a `RedistributionResult` that includes:
- Final flow rates per participant
- Per-iteration snapshots (for convergence visualization)
- Overflow flows as { from, to, amount }[] edges
- Metrics computed on final state
- Number of iterations to convergence
- Whether convergence was achieved

MOCK DATA in /lib/tbff/mock-data.ts:
Create 8 realistic participants matching this network:
- Ygg (AI Infrastructure, 🌲, min $3k, max $6k)
- Eve (Community Design, 🌿, min $2k, max $4.5k)
- Artem (Protocol Research, 🔬, min $2.5k, max $5k)
- Carol Anne (Indigenomics, 🪶, min $3.5k, max $7k)
- Darren (GPU Engineering, ⚡, min $2.8k, max $5.5k)
- Cascadia Fund (Bioregional Commons, 🏔️, min $5k, max $12k)
- Regen CoLab (Registry Systems, ♻️, min $4k, max $8k)
- Kwaxala (Forest Alliance, 🌳, min $2k, max $5k)
Each with realistic cross-allocations (all allocations for each participant sum to 100%).

VISUAL CONVERGENCE DEBUGGER — /app/debug/convergence/page.tsx:
Build a full-page visual tool that:
1. Shows the initial state of all 8 participants as WaterTank components in a row
2. Has a "Total External Funding" slider ($10k to $80k/month)
3. A "Run Redistribution" button that executes the algorithm
4. After running, displays a step-through visualization:
   - Each iteration k shown as a row of mini water tanks showing flow levels
   - Overflow arrows between participants for each iteration
   - A convergence chart showing total overflow decreasing per iteration
   - Final state with all metrics displayed
5. A "What If" panel where you can adjust any participant's thresholds and see the before/after diff

TESTING:
- Vitest tests for the algorithm covering:
  - Underfunded scenario (inflow < sum of minimums): verify proportional distribution
  - Exactly funded (inflow = sum of maximums): verify zero overflow
  - Overfunded (inflow > sum of maximums): verify overflow redistribution converges
  - Circular allocations (A→B→C→A): verify convergence, no infinite loops
  - Single participant with 100% self-allocation: verify funds don't multiply
  - Conservation: total inflow == sum of all final flows (within epsilon)
  - Edge case: participant with min == max (zero operational range)
- The convergence debugger page itself serves as visual validation — a human should be able to see the algorithm working correctly step by step

This is the mathematical heart of the entire system. Every dollar must be accounted for. The debugger must make the algorithm's correctness visually self-evident.
```

---

## Phase 3 — Dashboard Layout Shell and Navigation with All 8 View Stubs

```
This is Phase 3 of 10 for FlowFunding. Phases 1-2 created the design system and TBFF algorithm engine.

Build the main dashboard application shell with navigation and 8 view stubs that each display real data from the TBFF engine running against mock data.

APP SHELL — /app/(dashboard)/layout.tsx:
- Sticky header with FlowFunding logo (gradient teal-to-cyan circle + "FlowFunding" wordmark), streaming status indicator (green pulsing dot + "Streaming on Base"), and user identity (avatar + name from mock data for current user = Ygg)
- Left sidebar navigation (200px) with 8 items, each with emoji icon and label:
  1. 💧 My Pool
  2. 🌐 Network
  3. 🎚️ Thresholds
  4. 🌊 Allocations
  5. 📊 Analytics
  6. ⚡ Activity
  7. 👥 People
  8. 🚀 Onboarding
- Active state: left accent border, tinted background, bold text
- Main content area with padding, overflow scroll
- URL-based routing: /dashboard/pool, /dashboard/network, etc.
- Responsive: sidebar collapses to bottom tab bar on mobile (<768px)

STATE MANAGEMENT:
Create a React context (TBFFContext) in /lib/context.ts that:
- Holds the full NetworkState computed from mock data
- Runs the TBFF redistribution algorithm on initialization
- Exposes the current user's Participant data
- Provides a dispatch function for simulating changes (threshold updates, allocation changes)
- Recalculates redistribution whenever inputs change
- Wraps the dashboard layout

EACH VIEW STUB should be a real page that pulls from context and displays meaningful data using the Phase 1 design system components. Not placeholder "coming soon" text — each should show actual computed values:

1. My Pool (/dashboard/pool): Show current user's WaterTank (large, centered), current flow rate, satisfaction %, incoming flow sources list, and outgoing allocation list. All from computed state.

2. Network (/dashboard/network): Placeholder SVG showing participant nodes positioned in a circle with their avatars and names. Lines between them representing allocations. Will be upgraded in Phase 4.

3. Thresholds (/dashboard/thresholds): Two sliders (min and max) pre-populated with current user's values. A horizontal zone visualization bar. A preview WaterTank showing the effect.

4. Allocations (/dashboard/allocations): List of current user's allocation recipients with percentage sliders. Total percentage indicator. Pie/donut chart preview.

5. Analytics (/dashboard/analytics): StatCard row with key metrics (total inflow, distribution efficiency, min coverage, Gini). Bar chart of per-participant satisfaction.

6. Activity (/dashboard/activity): Mock activity feed with 10+ realistic events, each with timestamp, type icon, and description. Pull participant names from mock data.

7. People (/dashboard/people): Grid of participant cards showing avatar, name, role, status badge (Below Min / Sustainable / Overflowing), current flow, threshold range, and mini progress bar.

8. Onboarding (/dashboard/onboarding): 3-step carousel explaining (a) what flow funding is, (b) how thresholds work, (c) how overflow cascades. Uses WaterTank and simple SVG illustrations.

VALIDATION:
- Every view must render without errors and display data consistent with the TBFF algorithm output
- Navigation between all 8 views must work via URL and sidebar clicks
- Mobile layout (bottom tabs) must be functional
- Create an E2E smoke test (Playwright or just a manual checklist page at /app/test/page.tsx) that verifies: navigation works, all 8 views render, data is present, no console errors
- The dashboard should feel like a real product even though it's using mock data — a visitor should believe it could be connected to a live system
```

---

## Phase 4 — Interactive Network Graph with D3 Force Simulation

```
This is Phase 4 of 10 for FlowFunding. Phases 1-3 created the design system, TBFF engine, and dashboard shell with 8 views.

Upgrade the Network view (/dashboard/network) into a fully interactive D3 force-directed graph visualization.

NETWORK GRAPH COMPONENT — /components/views/NetworkGraph.tsx:

Use D3 force simulation (d3-force) rendered into an SVG within a React component. Do NOT use a canvas — SVG allows for easier interaction and animation.

NODES:
- Each participant is a node
- Node radius proportional to maxThreshold (bigger capacity = bigger node)
- Inside each node: a circular "water level" fill showing currentFlow / maxThreshold percentage
- Fill color: below min = warn red, operational = accent teal, overflow = cyan
- Participant avatar emoji rendered at node center
- Name label below each node
- On hover: show tooltip with name, role, current flow, min/max thresholds, satisfaction %
- On click: select the node, highlight all its allocation edges, show detail panel

EDGES:
- Each allocation preference is a directed edge from allocator to recipient
- Edge width proportional to allocation percentage (thicker = higher %)
- Edge color: teal with opacity based on weight
- Curved edges (D3 link force with curvature) to distinguish bidirectional allocations
- Animated particles flowing along edges in the direction of allocation:
  - Small teal circles that travel along the edge path
  - Speed proportional to the actual overflow amount flowing through that edge
  - Only show particles on edges that are actively carrying overflow (not dormant allocations)

FORCE SIMULATION:
- Charge force: nodes repel each other (prevent overlap)
- Link force: allocated participants attract (cluster together)
- Center force: keep the graph centered in the viewport
- Collision force: prevent node overlap based on radius
- The simulation should settle into a stable layout within 2-3 seconds

INTERACTIVITY:
- Drag nodes to reposition them (D3 drag behavior)
- Zoom and pan (D3 zoom behavior) with smooth transitions
- Click background to deselect
- Selected node: dashed rotating orbit ring, all connected edges highlighted at full opacity, unconnected edges dim to 10% opacity
- Double-click a node: navigate to that participant's detail in the People view

DETAIL PANEL:
- When a node is selected, show a slide-in panel on the right (or below on mobile) with:
  - Participant's WaterTank component
  - Flow breakdown: incoming streams listed, outgoing allocations listed
  - Key stats: satisfaction %, overflow amount, days streaming

EXTERNAL FUNDING VISUALIZATION:
- Show a special "External Pool" node at the top/center of the graph, visually distinct (larger, gradient fill, pulsing glow)
- Streams from External Pool to each participant based on their direct funding allocation
- This node should have a slider overlay or be controlled from a sidebar input to adjust total external funding and see the graph react in real time

REAL-TIME UPDATE:
- When the total external funding slider changes:
  1. Re-run the TBFF redistribution algorithm
  2. Animate node water levels to new values (smooth CSS transition on the fill rect)
  3. Update edge particle flows (new edges appear, disappeared ones fade out)
  4. Update all metrics in the detail panel
  5. The graph should react smoothly, not jump

VALIDATION:
- Visual validation: the graph should make the mechanism self-evident. A person seeing it for the first time should understand "money flows in at the top, fills up each person's pool, and excess cascades forward"
- Test: adjust funding from $20k to $60k and verify that underfunded participants fill up first, then operational range fills, then overflow particles appear
- Test: select a participant and verify their incoming/outgoing flows match the algorithm output
- Verify: total of all visible flow amounts equals total external funding (conservation law is visually verifiable)
- Mobile: graph should be zoomable and pannable on touch, detail panel below instead of right side
```

---

## Phase 5 — Threshold Editor with What-If Simulation and Anti-Gaming Validation

```
This is Phase 5 of 10 for FlowFunding. Phases 1-4 created the design system, TBFF engine, dashboard shell, and interactive network graph.

Upgrade the Thresholds view (/dashboard/thresholds) into a production-quality threshold editor with live simulation preview and anti-gaming validation.

THRESHOLD EDITOR — /components/views/ThresholdEditor.tsx:

MAIN PANEL (left 60%):

1. Context Header:
   - "Set Your Thresholds" title
   - Explanatory paragraph: "Your thresholds define how funding flows through you. The minimum is your sustainability floor — what you need to keep working. The maximum is your optimal ceiling — above this, surplus flows forward to others."
   - Current values displayed as editable fields with formatted currency

2. Dual Slider Section:
   - Minimum Threshold slider: range $500–$10,000/mo, step $100, color warn
   - Maximum Threshold slider: range $1,000–$20,000/mo, step $100, color cyan
   - Constraint: max must be >= min * 1.2 (enforced in real time — if user drags max below this, it snaps back with a subtle shake animation and tooltip explaining the 20% buffer requirement)
   - Both sliders show the dollar value in real time next to the label

3. Zone Visualization Bar:
   - Full-width horizontal bar divided into three labeled zones:
     - Left zone (0 to min): red-tinted "Below Minimum — Underfunded ⚠️"
     - Middle zone (min to max): green-tinted "Operational Range — Sustainable ✓"
     - Right zone (max to capacity): blue-tinted "Overflow Zone — Flows Forward ↗"
   - A marker showing current flow level position on this bar
   - Zones resize in real time as sliders move

4. Validation Warnings (shown conditionally):
   - If min > network average min * 2: amber warning "Your minimum is significantly above the network average ({networkAvg}). Peer review may be triggered."
   - If max < current flow: info notice "Reducing max below your current flow will cause immediate overflow redistribution of {amount}/mo."
   - If change from previous values > 25%: amber warning "Changes exceeding 25% require a 48-hour cooling period before taking effect."
   - If min > total_inflow / participant_count: red warning "Your minimum exceeds the per-participant fair share of current inflow."

5. Network Impact Preview:
   - Run simulateWhatIf() with the proposed thresholds
   - Show a compact before/after comparison:
     - "Network min-threshold coverage: 87% → 82% ↓" (with red/green arrow)
     - "Your satisfaction: 70% → 85% ↑"
     - "Overflow from you: $0 → $1,200/mo" (if max decreased)
   - List of participants whose flow would change, with delta amounts

6. Action Buttons:
   - "Cancel" (ghost) — resets to current values
   - "Simulate" (secondary) — scrolls to the What-If panel below
   - "Save Thresholds" (primary) — with confirmation dialog summarizing all changes and their network impact

PREVIEW PANEL (right 40%):

1. Your Pool: Large WaterTank component showing the preview state with new thresholds applied
2. Peer Comparison Card:
   - "Your Min" vs "Network Average Min"
   - "Your Max" vs "Network Average Max"
   - "Your Percentile" — where you fall in the distribution
   - Mini histogram showing threshold distribution across all participants

WHAT-IF SIMULATION PANEL (full width, below main):

Expandable section that shows the full convergence visualization from Phase 2's debugger, but scoped to the proposed change:
1. Row of mini WaterTank components for all participants, showing BEFORE state
2. Row of mini WaterTank components showing AFTER state (with proposed thresholds)
3. Diff arrows between the two rows showing which participants gain/lose flow
4. Convergence metrics: iterations needed, total overflow redistributed
5. "This change would redirect ${amount}/mo from {names} to {names}"

TESTING:
- Unit tests for all validation rules (20% buffer, 25% change limit, network average comparison)
- Visual test: drag min slider above max and verify the snap-back behavior
- Visual test: set thresholds that would underfund someone and verify the warning appears
- Visual test: verify the What-If simulation produces identical results to the convergence debugger for the same inputs
- Verify: conservation law holds in the What-If preview (total in == total distributed)
```

---

## Phase 6 — Allocation Editor with Circular Flow Detection and Live Donut Preview

```
This is Phase 6 of 10 for FlowFunding. Phases 1-5 created the design system, TBFF engine, dashboard, network graph, and threshold editor.

Upgrade the Allocations view (/dashboard/allocations) into a production-quality flow-forward editor with circular flow detection and live redistribution preview.

ALLOCATION EDITOR — /components/views/AllocationEditor.tsx:

HEADER:
- "Flow-Forward Allocations" title
- Explanation: "When your funding exceeds your maximum threshold, surplus flows forward to participants you choose. Set the percentage each recipient receives. These preferences encode your judgment about where resources create the most value."
- Show current overflow status: "Your current overflow: $X/mo" or "No overflow — you're within your operational range. These preferences activate when you exceed {maxThreshold}."

RECIPIENT LIST:
For each allocation entry:
- Participant avatar (emoji, large), name, role subtitle
- Percentage displayed as large mono-font number
- Custom styled range slider (0–100, step 1)
- Calculated dollar amount: "(≈ ${overflowAmount * percentage / 100}/mo if overflowing)"
- "Remove" button (trash icon, appears on hover, requires confirm)
- Drag handle for reordering (optional but nice)

TOTAL INDICATOR:
- Always visible, sticky at the bottom of the list
- Shows total: "{sum}% of 100%"
- Color-coded: green if exactly 100%, amber if under, red if over
- If under 100%: "Remaining {remainder}% will be returned to the network pool"
- If over 100%: "Exceeds 100% — please adjust before saving" with all sliders slightly red-tinted
- Normalize button: "Auto-balance to 100%" — proportionally scales all allocations to sum to exactly 100%

ADD RECIPIENT:
- "+ Add Recipient" button opens a searchable dropdown of all network participants not currently in the list
- Each option shows avatar, name, role, and their current satisfaction %
- Selecting adds them at 0% with the slider ready to adjust

CIRCULAR FLOW DETECTION — /lib/tbff/cycle-detection.ts:
Implement a graph cycle detector that:
1. Takes the full allocation matrix for all participants
2. Detects cycles (A→B→A, A→B→C→A, etc.)
3. For each cycle, computes the "trap ratio" — the percentage of overflow that would circulate endlessly (before convergence dampens it)
4. Returns warnings for the current user's allocations

Display warnings:
- If the user allocates to someone who allocates back to them (2-node cycle): amber warning "Reciprocal allocation detected: you allocate {x}% to {name}, who allocates {y}% back to you. This creates a feedback loop that the algorithm will dampen, but may warrant review."
- If a 3+ node cycle is detected: info notice "Your allocations participate in a {n}-node flow cycle. The redistribution algorithm handles this correctly, but be aware that {trap_ratio}% of overflow will cycle before settling."
- Never block — just inform. The algorithm handles cycles by converging.

LIVE DONUT CHART:
- SVG donut/pie chart updating in real time as sliders move
- Each segment colored with a unique color per recipient
- Center text: "OVERFLOW DISTRIBUTION"
- Hover segment: show recipient name and percentage
- Animate transitions when percentages change

NETWORK IMPACT PREVIEW:
- Run simulateWhatIf() with the proposed allocations
- Show how the flow network would change:
  - Mini network graph (simplified — just the user's node and their direct recipients) showing edge widths changing
  - Before/after for each recipient: "Artem: $0 → $312/mo from your overflow"

TESTING:
- Unit test: cycle detection for 2-node, 3-node, and no-cycle cases
- Unit test: auto-normalize function preserves relative proportions while summing to 100
- Visual test: add all participants, set random allocations, verify donut chart segments match
- Visual test: create a deliberate A→B→A cycle and verify the warning appears
- Verify: saving valid allocations (sum=100%) updates the context and re-runs redistribution
- Verify: the network graph (Phase 4) reflects allocation changes when navigating back to it
```

---

## Phase 7 — Analytics Dashboard with Historical Simulation and Equity Metrics

```
This is Phase 7 of 10 for FlowFunding. Phases 1-6 created the design system, engine, shell, graph, thresholds, and allocations.

Upgrade the Analytics view (/dashboard/analytics) into a comprehensive metrics dashboard with simulated historical data and equity analysis.

GENERATE HISTORICAL DATA — /lib/tbff/history.ts:
Create a function that generates 6 months of simulated historical data by:
1. Starting with the current mock network state
2. For each of 26 weekly snapshots (6 months):
   - Vary total external funding with a random walk (+/- 5% per week, with an upward trend)
   - Occasionally add/remove a participant (simulate joins/leaves)
   - Occasionally have a participant change thresholds (±10%)
   - Run the TBFF algorithm for each snapshot
   - Record: date, per-participant flows, overflow amounts, metrics (Gini, coverage, satisfaction)
3. Return as a typed array of WeeklySnapshot objects

TOP METRICS ROW — 4 StatCards:
- Total Monthly Inflow (with % change from last month)
- Distribution Efficiency (distributed / inflow, with trend arrow)
- Min Threshold Coverage (% of participants above minimum, with trend)
- Network Gini Coefficient (with trend — lower is better)

FUNDING FLOWS CHART — /components/charts/FundingFlowChart.tsx:
- Stacked area chart using D3 or Recharts showing monthly:
  - Total inflow (top line)
  - Total distributed (filled area below)
  - Total overflow (small wedge between distributed and inflow)
- X-axis: months. Y-axis: dollars.
- Hover tooltip showing exact values for each month
- Color: teal gradient for distributed, cyan for overflow wedge

PARTICIPANT SATISFACTION PANEL:
- Horizontal bar chart for each participant:
  - Bar width = satisfaction percentage (current - min) / (max - min)
  - Color coded: red if below 0% (below min), teal if 0-100%, cyan if >100% (overflowing)
  - Participant name and avatar on the left, percentage on the right
  - Sorted by satisfaction (lowest first — surfaces underfunded participants)

CONVERGENCE METRICS:
- Small card showing last redistribution stats:
  - Bar chart of overflow-per-iteration (should decrease monotonically)
  - "Converged in N iterations"
  - "Total overflow redistributed: $X"

EQUITY TREND CHART:
- Line chart of Gini coefficient over 6 months
- Include a horizontal reference line at 0.25 labeled "Target"
- Show the trend direction and rate of change
- Second y-axis (or separate small chart): min-threshold coverage % over time

FLOW SANKEY (simplified):
- A Sankey-style diagram showing:
  - Left: External funding source(s)
  - Middle: Participants (sized by flow received)
  - Right: Overflow destinations
- This should make the redistribution cascade visually clear at a glance
- Use D3 sankey layout or a simplified custom implementation

EXPORT FUNCTIONALITY:
- "Export Report" button that generates a downloadable summary:
  - CSV of per-participant monthly flows, thresholds, and satisfaction
  - Formatted for tax reporting purposes
  - Include column headers: Participant, Month, Inflow, Overflow Sent, Overflow Received, Net Flow, Min Threshold, Max Threshold

TESTING:
- Verify historical data generator produces valid data (no negative flows, conservation holds per snapshot)
- Verify Gini coefficient calculation against known distributions (perfectly equal = 0, one person gets everything = approaches 1)
- Verify all charts render without errors for all 26 data points
- Visual test: the funding flow chart should show a clear upward trend with some variance
- Visual test: the satisfaction bars should match the computed values from the TBFF engine
- Export CSV should be parseable and contain correct data
```

---

## Phase 8 — Activity Feed, People Directory, and Onboarding Flow with Persistent State

```
This is Phase 8 of 10 for FlowFunding. Phases 1-7 created the core engine, all major views, and analytics.

Complete the remaining three views and add persistent state so the application maintains user changes across sessions.

ACTIVITY FEED — /components/views/ActivityFeed.tsx:

Event-driven timeline with:
1. Event generation: Create an EventEngine class in /lib/tbff/events.ts that:
   - Takes the current NetworkState and previous NetworkState
   - Diffs them to generate events: new inflows, threshold changes, allocation changes, redistribution completions, participant joins/leaves
   - Each event has: id, timestamp, type, participantId, message (human-readable), amount (optional), accent color
   - Generate 20+ realistic historical events spanning the last 30 days

2. Timeline UI:
   - Vertical timeline with a thin line on the left
   - Each event as a card with: colored dot matching event type, message text, timestamp (relative: "2 min ago", "3 days ago"), participant avatar if relevant
   - Most recent event has a subtle glow/pulse animation
   - Type-based filtering: toggleable chips at the top for each event type
   - "Load more" pagination at the bottom

3. Real-time simulation:
   - Every 30 seconds, generate a simulated new event (a small inflow fluctuation, a minor redistribution) and prepend it to the feed with a slide-in animation
   - This creates the feeling of a live system even with mock data

PEOPLE DIRECTORY — /components/views/PeopleDirectory.tsx:

Grid of participant cards with:
1. Card layout (responsive grid, 1-3 columns):
   - Avatar (large emoji), name, role
   - Status badge: "Below Min" (red), "Sustainable" (teal), "Overflowing" (cyan)
   - Current flow rate with formatted currency
   - Threshold range: "$X – $Y/mo"
   - Mini satisfaction bar
   - Click → expand to show:
     - WaterTank visualization
     - Incoming flows list
     - Outgoing allocations list (as avatars with percentages)
     - Days since joining
     - Flow history sparkline (last 30 days using the historical data from Phase 7)

2. Sort/filter controls:
   - Sort by: name, satisfaction (low first), current flow, threshold size
   - Filter: status (below min / sustainable / overflowing), search by name

3. "Invite Participant" button (non-functional, but shows the intended UI — modal with email input and role selection)

ONBOARDING FLOW — /components/views/OnboardingFlow.tsx:

3-step interactive tutorial:

Step 1: "Funding That Flows Like Water"
- Large animated illustration: rain (particles) falling into a watershed, flowing into pools
- Build this as a small SVG/canvas animation, not a static image
- Three feature cards: Set Thresholds, Direct Overflow, Watch It Flow
- "Next" button

Step 2: "How Thresholds Work"
- Side-by-side cards explaining min (sustainability floor) and max (optimal ceiling)
- Interactive mini-demo: a single WaterTank with two sliders that the user can adjust to see zones change
- Show the three zones filling as a user moves the "funding level" slider up
- When it crosses max: animated overflow particles spill out with a label "Surplus flows forward →"

Step 3: "The Flow-Forward Cascade"
- Animated SVG showing: Funder → Alice → Bob → Carol cascade
- Particles flow from funder to Alice (fills up), overflow particles flow from Alice to Bob and Carol
- Step-by-step narration appearing as the animation plays
- "Get Started →" button that navigates to /dashboard/pool

Progress dots at the top. Back/Next navigation. The animation should make the mechanism feel obvious and inevitable — "of course this is how funding should work."

PERSISTENT STATE — /lib/storage.ts:
Using localStorage (with a wrapper that gracefully degrades):
1. Save the current user's threshold settings whenever they change
2. Save allocation preferences
3. Save the selected view (restore last-visited tab on reload)
4. Save onboarding completion status (don't show onboarding again after completing it)
5. Provide a "Reset All Data" button in a settings section of the sidebar

TESTING:
- Activity feed: verify event generation produces valid, chronologically ordered events
- Activity feed: verify type filtering works (toggle off "redistribution" → no redistribution events shown)
- People directory: verify all sort modes produce correct ordering
- Onboarding: verify step navigation, progress dots, and "Get Started" routing
- Persistent state: change thresholds, refresh page, verify they persist
- Persistent state: complete onboarding, refresh, verify it doesn't show again
- Visual test: the onboarding animations should be smooth and clearly communicate the mechanism
```

---

## Phase 9 — Wallet Connection, Superfluid Integration, and Streaming Balance Hook

```
This is Phase 9 of 10 for FlowFunding. Phases 1-8 created the complete mock-data application.

Now connect the app to real blockchain infrastructure: wallet connection on Base, Superfluid SDK integration, and the streaming balance hook that makes balances tick in real time.

IMPORTANT: This phase creates the integration layer. The app should work in TWO MODES:
- Demo mode (default): Uses mock data, no wallet required. Everything works as before.
- Live mode: Activated when a wallet is connected. Reads real data from Base/Base Sepolia.
- A toggle in the header switches between modes. Demo mode is always available.

WALLET CONNECTION — /lib/web3/wallet.ts and /components/WalletButton.tsx:

1. Install and configure wagmi v2 + viem + @coinbase/wallet-sdk:
   ```
   wagmi, viem, @tanstack/react-query, @coinbase/wallet-sdk
   ```

2. wagmi config in /lib/web3/config.ts:
   - Chains: Base (8453) and Base Sepolia (84532)
   - Connectors: Coinbase Smart Wallet (primary), MetaMask (fallback), WalletConnect
   - Transport: public Base RPC (or Alchemy/Infura if configured via env var)

3. WalletButton component:
   - Disconnected: "Connect Wallet" button with gradient border
   - Connecting: pulsing animation
   - Connected: truncated address (0x1234...5678) with chain indicator dot (green for Base, amber for Base Sepolia)
   - Click connected state: dropdown with full address (copy button), chain switcher, disconnect
   - Place in the header, replacing the static user identity in live mode

4. Wrap the app in WagmiProvider + QueryClientProvider in the root layout

SUPERFLUID SDK INTEGRATION — /lib/web3/superfluid.ts:

1. Install @superfluid-finance/sdk-core and @superfluid-finance/ethereum-contracts

2. Create a SuperfluidService class that:
   - Initializes the Superfluid Framework for the connected chain
   - Provides methods:
     - `getAccountFlowInfo(address)` — net flow rate, deposit, owedDeposit
     - `getStreamsToAccount(address)` — list of incoming CFA streams with sender, flowRate, startDate
     - `getStreamsFromAccount(address)` — list of outgoing CFA streams
     - `getPoolMemberships(address)` — GDA pool memberships with units and pool addresses
     - `getSuperTokenBalance(address, token)` — real-time balance (static + flowRate * elapsed)
   - All methods return typed results matching the Participant interface where possible

3. Create a mapping layer that converts Superfluid data to TBFF types:
   - Flow rates (wei/second) → monthly dollar amounts (using a price oracle or hardcoded USDC = $1)
   - Super Token addresses → human-readable names
   - Stream metadata → participant identities (using an on-chain registry or off-chain lookup)

STREAMING BALANCE HOOK — /lib/hooks/useStreamingBalance.ts:

This is the signature feature that makes the app feel alive:

```typescript
function useStreamingBalance(address: string, superToken: string): {
  balance: bigint;          // Current computed balance
  flowRate: bigint;         // Net flow rate in wei/second
  formattedBalance: string; // "$4,201.37" — updates every frame
  formattedFlowRate: string; // "+$4,200/mo"
  isPositive: boolean;
  lastUpdated: Date;
}
```

Implementation:
1. Fetch the static balance and net flow rate from Superfluid
2. Use requestAnimationFrame to compute: currentBalance = staticBalance + (flowRate * secondsSinceLastUpdate)
3. Format as USD with 2 decimal places
4. The formatted value should visibly tick up (or down) every ~100ms
5. Provide a graceful fallback for demo mode (static values)

INTEGRATION WITH EXISTING VIEWS:
- In live mode, the "My Pool" view should show the streaming balance ticking in real time
- Replace the static "$4,200/mo" with the live useStreamingBalance hook output
- The WaterTank fill level should animate smoothly based on the streaming balance
- The StatCard for "Current Flow" should show the ticking balance

SUPERFLUID SUBGRAPH QUERIES — /lib/web3/subgraph.ts:
- Configure Apollo Client pointed at Superfluid's Base subgraph
- Create typed queries for:
  - Account flow state (current streams, net flow)
  - Stream events (created, updated, terminated) for the activity feed
  - Pool distribution events
- In live mode, the Activity Feed should show real on-chain events

TESTING:
- Unit test: useStreamingBalance correctly computes balance from static + flowRate * time
- Unit test: flow rate conversion (wei/second to $/month) is accurate
- Verify: demo mode still works perfectly with no wallet connected
- Verify: connecting a wallet on Base Sepolia triggers live mode UI changes (header shows address, streaming badge changes)
- Verify: if no Superfluid streams exist for the connected wallet, show a graceful empty state ("No active streams. Start by setting your thresholds.")
- Create /app/test/wallet/page.tsx — a test page that displays raw wallet data: connected address, chain ID, ETH balance, USDCx balance (if any), active streams (if any). This is the integration validation page.
```

---

## Phase 10 — Smart Contract Interfaces, Transaction Flows, and Deployment Readiness

```
This is Phase 10 of 10 for FlowFunding. Phases 1-9 created the complete application with wallet integration.

This final phase adds the smart contract interaction layer so the app can write to the blockchain, implements transaction flows for every user action, adds security validations, and prepares the app for deployment.

SMART CONTRACT INTERFACES — /lib/web3/contracts/:

1. TBFFRegistry.ts — Interface for the participant registry contract:
   - registerParticipant(minThreshold, maxThreshold) — register with initial thresholds
   - updateThresholds(minThreshold, maxThreshold) — change thresholds (with 48hr timelock for >25% changes)
   - updateAllocations(recipients[], percentages[]) — set flow-forward preferences
   - getParticipant(address) → { minThreshold, maxThreshold, allocations, registeredAt }
   - getAllParticipants() → Participant[]
   - Events: ParticipantRegistered, ThresholdsUpdated, AllocationsUpdated

2. TBFFController.ts — Interface for the redistribution controller:
   - executeRedistribution() — trigger redistribution cycle (callable by keeper or anyone)
   - getRedistributionState() → { lastExecuted, iterationsUsed, totalOverflowRedistributed }
   - pause() / unpause() — emergency controls (admin only)

3. For Phase 10, these are TypeScript INTERFACES with typed ABI fragments — not deployed contracts.
   Use wagmi's useReadContract / useWriteContract hooks to build the transaction layer.
   Provide a mock contract mode that simulates transactions locally for testing.

TRANSACTION FLOWS — /lib/web3/transactions.ts:

Every user action that writes to the blockchain should follow this UX pattern:

1. User takes action in the UI (e.g., clicks "Save Thresholds")
2. Confirmation modal appears showing:
   - What will happen (plain English: "Update your minimum to $3,500/mo and maximum to $7,000/mo")
   - Estimated gas cost (or "Sponsored — no gas fee" if using paymaster)
   - Network impact summary (from What-If simulation)
   - "Confirm" and "Cancel" buttons
3. On confirm:
   - Button enters loading state with spinner
   - Transaction submitted → show tx hash with block explorer link
   - Pending → "Waiting for confirmation..." with animated dots
   - Confirmed → success animation (green checkmark + confetti particles), toast notification
   - Failed → error message with retry button, detailed error in expandable section
4. After success:
   - Automatically refresh all relevant data from subgraph
   - Update local state optimistically (don't wait for subgraph indexing)
   - Show the updated state in all views

Implement this pattern for:
- Save Thresholds (from Threshold Editor)
- Save Allocations (from Allocation Editor)
- Register as Participant (from Onboarding "Get Started")

TRANSACTION SIMULATION — /lib/web3/simulate.ts:
Before sending any transaction, simulate it using viem's `simulateContract`:
- If simulation fails, show the error to the user BEFORE they sign
- Common errors to handle gracefully:
  - "Insufficient USDCx balance" → "You need to wrap more USDC to USDCx"
  - "Threshold below minimum" → "Your minimum must be at least $500/mo"
  - "Allocations don't sum to 100%" → "Please adjust your allocations"
  - "Cooldown active" → "You changed thresholds recently. You can update again on {date}."

SECURITY VALIDATIONS — /lib/web3/security.ts:
Client-side checks before any transaction:
1. Connected to the correct chain (Base or Base Sepolia, matching environment)
2. Participant is registered (for threshold/allocation updates)
3. Thresholds pass all validation rules from Phase 5
4. Allocations sum to 100% (or handle remainder explicitly)
5. No self-allocation (cannot allocate overflow to yourself)
6. Rate limiting: max 1 threshold change per 48 hours (enforced client-side as a warning, contract-side as a rule)

DEPLOYMENT READINESS:

1. Environment configuration — /lib/config.ts:
   - NEXT_PUBLIC_CHAIN_ID: 84532 (testnet) or 8453 (mainnet)
   - NEXT_PUBLIC_TBFF_REGISTRY_ADDRESS: contract address
   - NEXT_PUBLIC_TBFF_CONTROLLER_ADDRESS: contract address
   - NEXT_PUBLIC_USDCX_ADDRESS: USDCx Super Token address on Base
   - NEXT_PUBLIC_SUBGRAPH_URL: Superfluid subgraph endpoint
   - NEXT_PUBLIC_RPC_URL: Base RPC endpoint

2. SEO and metadata — proper Open Graph tags, title "FlowFunding — Threshold-Based Flow Funding on Base", description

3. Error boundary — /components/ErrorBoundary.tsx wrapping the dashboard layout with a graceful fallback UI

4. Loading states — every view should have a skeleton/shimmer loading state while data fetches

5. Build optimization:
   - Verify `next build` succeeds with zero errors
   - Verify all pages render correctly in production mode
   - Bundle size analysis — ensure D3 is tree-shaken, no unnecessary dependencies

FINAL VALIDATION CHECKLIST — /app/test/final/page.tsx:
Create an automated test page that verifies the complete system:

1. ✅ Design system: all components render correctly
2. ✅ TBFF engine: algorithm produces correct results for 5 test scenarios
3. ✅ Conservation: total inflow == total distributed in all scenarios
4. ✅ Navigation: all 8 views accessible and render without errors
5. ✅ Network graph: nodes and edges render, drag/zoom works
6. ✅ Threshold editor: validation rules fire correctly
7. ✅ Allocation editor: cycle detection works, normalize works
8. ✅ Analytics: charts render with historical data
9. ✅ Activity feed: events generate and filter correctly
10. ✅ Wallet: connection flow works (or gracefully shows demo mode)
11. ✅ Streaming balance: ticks in real time (or shows static in demo mode)
12. ✅ Transaction flow: confirmation modal renders for all 3 transaction types
13. ✅ Responsive: all views work at 375px, 768px, and 1440px widths
14. ✅ No console errors on any view
15. ✅ Build succeeds with zero errors

Each check should be a clickable test that runs and shows pass/fail with details. This page is your deployment readiness gate.

The app should now be a complete, deployable product that works in demo mode for anyone to explore and in live mode for participants connected to Base. A person encountering this application for the first time should understand threshold-based flow funding within 60 seconds, trust that the mechanism is fair and transparent, and feel confident that their money is being managed by a system inspired by the most successful resource allocation network in evolutionary history — the mycorrhizal web.
```

---

## Execution Notes

**Session management:** Each phase is designed to be completable in a single Claude Code session (2-4 hours of work). If a session runs long, you can split a phase across two sessions by providing the phase prompt plus "Continue from where we left off — here's the current state of the codebase."

**Validation cadence:** After every phase, run the app locally (`npm run dev`) and visually verify the test/validation page for that phase before moving on. Fixing issues within the same phase is far cheaper than debugging cross-phase regressions.

**Git discipline:** Commit after each phase with a descriptive message: `git commit -m "Phase N: {phase title}"`. This gives you clean rollback points.

**Dependency on real contracts:** Phases 1-8 work entirely with mock data and require zero blockchain infrastructure. Phase 9 adds read-only chain integration. Phase 10 adds write transactions. You can demo the full product after Phase 8 and deploy a fully functional prototype without ever deploying a smart contract — the contract interfaces in Phase 10 are typed stubs ready for when TBFFController is deployed on Base.
