export const tbffNetworkAbi = [
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
    name: "settle",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
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
] as const;
