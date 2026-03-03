"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Address } from "viem";
import { wadToUsd } from "@/lib/tbff/chain-bridge";

interface AnimatedValuesInput {
  nodes: Address[] | undefined;
  values: bigint[] | undefined;
  flowInfo: Map<Address, { netFlowRate: bigint; lastUpdated: bigint }>;
  /** Timestamp (seconds) when balances were fetched */
  fetchTimestamp?: number;
}

/**
 * Animates on-chain values at 60fps using flow rates.
 * value_now = base_value + flowRate * elapsed_seconds
 */
export function useAnimatedBalances({
  nodes,
  values,
  flowInfo,
  fetchTimestamp,
}: AnimatedValuesInput): Record<string, number> {
  const [animated, setAnimated] = useState<Record<string, number>>({});
  const rafRef = useRef<number>(0);
  const baseRef = useRef<{ nodes: Address[]; values: bigint[]; fetchTime: number } | null>(null);

  // Update base values when chain data changes
  useEffect(() => {
    if (nodes && values && nodes.length === values.length) {
      baseRef.current = {
        nodes: [...nodes],
        values: [...values],
        fetchTime: fetchTimestamp ?? Date.now() / 1000,
      };
    }
  }, [nodes, values, fetchTimestamp]);

  const animate = useCallback(() => {
    const base = baseRef.current;
    if (!base) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    const now = Date.now() / 1000;
    const result: Record<string, number> = {};

    for (let i = 0; i < base.nodes.length; i++) {
      const addr = base.nodes[i];
      const baseUsd = wadToUsd(base.values[i]);
      const info = flowInfo.get(addr);

      if (info && info.netFlowRate !== 0n) {
        const elapsed = now - base.fetchTime;
        const ratePerSec = wadToUsd(info.netFlowRate);
        result[addr.toLowerCase()] = baseUsd + ratePerSec * elapsed;
      } else {
        result[addr.toLowerCase()] = baseUsd;
      }
    }

    setAnimated(result);
    rafRef.current = requestAnimationFrame(animate);
  }, [flowInfo]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return animated;
}
