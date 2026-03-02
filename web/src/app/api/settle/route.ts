import { createPublicClient, createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import { TBFF_NETWORK_ADDRESS } from "@/lib/tbff/live-config";
import { NextResponse } from "next/server";

const ANVIL_DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export async function POST() {
  try {
    const account = privateKeyToAccount(ANVIL_DEPLOYER_KEY);
    const client = createWalletClient({
      account,
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
    });
    const publicClient = createPublicClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
    });

    const hash = await client.writeContract({
      address: TBFF_NETWORK_ADDRESS,
      abi: tbffNetworkAbi,
      functionName: "settle",
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({
      hash,
      status: receipt.status,
      blockNumber: Number(receipt.blockNumber),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
