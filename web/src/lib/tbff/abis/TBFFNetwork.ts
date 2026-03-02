export const tbffNetworkAbi = [
  // ─── Existing Views ─────────────────────────────────────────
  {
    type: "function",
    name: "getNetworkState",
    inputs: [],
    outputs: [
      { name: "", type: "address[]" },
      { name: "", type: "uint256[]" },
      { name: "", type: "uint256[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getActiveStreams",
    inputs: [],
    outputs: [
      { name: "froms", type: "address[]" },
      { name: "tos", type: "address[]" },
      { name: "rates", type: "int96[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getNodeCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isNode",
    inputs: [{ name: "node", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nodeIndex",
    inputs: [{ name: "node", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nodes",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastSettleTimestamp",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastSettleIterations",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastSettleConverged",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastSettleTotalRedistributed",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "streamEpoch",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // ─── Phase 3 Constants ──────────────────────────────────────
  {
    type: "function",
    name: "MIN_THRESHOLD",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_THRESHOLD",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SEED_AMOUNT",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // ─── Phase 3 Views ─────────────────────────────────────────
  {
    type: "function",
    name: "getProfile",
    inputs: [{ name: "node", type: "address" }],
    outputs: [
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllProfiles",
    inputs: [],
    outputs: [
      { name: "addrs", type: "address[]" },
      { name: "names", type: "string[]" },
      { name: "emojis", type: "string[]" },
      { name: "roles", type: "string[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFlowThrough",
    inputs: [],
    outputs: [
      { name: "", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "cumulativeFlowThrough",
    inputs: [{ name: "node", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // ─── Existing Write ─────────────────────────────────────────
  {
    type: "function",
    name: "settle",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ─── Phase 3 Write ─────────────────────────────────────────
  {
    type: "function",
    name: "selfRegister",
    inputs: [
      { name: "maxThreshold", type: "uint256" },
      { name: "name", type: "string" },
      { name: "emoji", type: "string" },
      { name: "role", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMyAllocations",
    inputs: [
      { name: "targetIndices", type: "uint256[]" },
      { name: "weights", type: "uint96[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMyThreshold",
    inputs: [{ name: "newThreshold", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMyProfile",
    inputs: [
      { name: "name", type: "string" },
      { name: "emoji", type: "string" },
      { name: "role", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rain",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ─── Existing Events ────────────────────────────────────────
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "iterations", type: "uint256", indexed: false },
      { name: "converged", type: "bool", indexed: false },
      { name: "totalRedistributed", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StreamCreated",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "flowrate", type: "int96", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StreamUpdated",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "newRate", type: "int96", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StreamDeleted",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
    ],
  },
  // ─── Phase 3 Events ────────────────────────────────────────
  {
    type: "event",
    name: "SelfRegistered",
    inputs: [
      { name: "node", type: "address", indexed: true },
      { name: "maxThreshold", type: "uint256", indexed: false },
      { name: "name", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ProfileUpdated",
    inputs: [{ name: "node", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "MyAllocationsSet",
    inputs: [{ name: "node", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "MyThresholdSet",
    inputs: [
      { name: "node", type: "address", indexed: true },
      { name: "newThreshold", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Rained",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "perNode", type: "uint256", indexed: false },
    ],
  },
] as const;
