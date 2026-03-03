"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Participant, IterationSnapshot } from "@/lib/tbff/engine";

interface DataTableProps {
  participants: Participant[];
  snapshots: IterationSnapshot[];
  initialValues: Record<string, number>;
}

export default function DataTable({
  participants,
  snapshots,
  initialValues,
}: DataTableProps) {
  const totalInitial = Object.values(initialValues).reduce((a, b) => a + b, 0);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background z-10">
              Participant
            </TableHead>
            <TableHead className="text-right">Initial</TableHead>
            {snapshots.map((s) => (
              <TableHead key={s.iteration} className="text-right">
                Iter {s.iteration}
              </TableHead>
            ))}
            {snapshots.length > 0 && (
              <TableHead className="text-right font-bold">&Delta;</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((p) => {
            const initial = initialValues[p.id] ?? p.value;
            const final =
              snapshots.length > 0
                ? snapshots[snapshots.length - 1].values[p.id] ?? initial
                : initial;
            const delta = final - initial;

            return (
              <TableRow key={p.id}>
                <TableCell className="sticky left-0 bg-background z-10 font-medium">
                  {p.emoji} {p.name}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  ${initial.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </TableCell>
                {snapshots.map((s, si) => {
                  const bal = s.values[p.id] ?? 0;
                  const prevBal =
                    si === 0
                      ? initial
                      : snapshots[si - 1].values[p.id] ?? 0;
                  const changed = Math.abs(bal - prevBal) > 0.01;

                  return (
                    <TableCell
                      key={s.iteration}
                      className={`text-right font-mono text-sm ${
                        changed ? "bg-blue-500/10 text-blue-400" : ""
                      }`}
                    >
                      ${bal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </TableCell>
                  );
                })}
                {snapshots.length > 0 && (
                  <TableCell
                    className={`text-right font-mono text-sm font-bold ${
                      delta > 0.01
                        ? "text-green-400"
                        : delta < -0.01
                        ? "text-red-400"
                        : "text-slate-400"
                    }`}
                  >
                    {delta >= 0 ? "+" : ""}
                    ${delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </TableCell>
                )}
              </TableRow>
            );
          })}

          {/* Total row */}
          <TableRow className="border-t-2 font-bold">
            <TableCell className="sticky left-0 bg-background z-10">
              TOTAL
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              ${totalInitial.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </TableCell>
            {snapshots.map((s) => {
              const total = Object.values(s.values).reduce((a, b) => a + b, 0);
              // Tolerance matches display rounding (integer dollars)
              const conserved = Math.abs(total - totalInitial) < 1.0;
              return (
                <TableCell
                  key={s.iteration}
                  className={`text-right font-mono text-sm ${
                    conserved ? "text-green-400" : "text-red-400"
                  }`}
                >
                  ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </TableCell>
              );
            })}
            {snapshots.length > 0 && (
              <TableCell className="text-right font-mono text-sm text-slate-400">
                $0
              </TableCell>
            )}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
