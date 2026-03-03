export const cfaV1ForwarderAbi = [
  {
    type: "function",
    name: "getFlowrate",
    inputs: [
      { name: "token", type: "address" },
      { name: "sender", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "", type: "int96" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccountFlowInfo",
    inputs: [
      { name: "token", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [
      { name: "lastUpdated", type: "uint256" },
      { name: "flowrate", type: "int96" },
      { name: "deposit", type: "uint256" },
      { name: "owedDeposit", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "grantPermissions",
    inputs: [
      { name: "token", type: "address" },
      { name: "flowOperator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;
