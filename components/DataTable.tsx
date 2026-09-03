"use client";

import { useMemo, useState } from "react";

import { formatCurrencyFull, formatDate, formatPercent } from "@/lib/format";
import type { Currency, DayMetrics } from "@/lib/types";

import { SortIcon } from "./icons";

type SortColumn = "date" | "arr" | "mrr" | "aov" | "dod";
type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "date", label: "date" },
  { key: "arr", label: "arr" },
  { key: "mrr", label: "mrr" },
  { key: "aov", label: "aov" },
  { key: "dod", label: "dod % change" },
];

function sortValue(entry: DayMetrics, column: SortColumn, currency: Currency): number | string {
  switch (column) {
    case "date":
      return entry.date;
    case "arr":
      return currency === "INR" ? entry.arrInr : entry.arrUsd;
    case "mrr":
      return currency === "INR" ? entry.mrrInr : entry.mrrUsd;
    case "aov":
      return currency === "INR" ? entry.aovInr : entry.aovUsd;
    case "dod":
      return (currency === "INR" ? entry.dodArrChangePctInr : entry.dodArrChangePctUsd) ?? -Infinity;
  }
}

function toCsv(rows: DayMetrics[], currency: Currency): string {
  const header = ["Date", `ARR (${currency})`, `MRR (${currency})`, `AOV (${currency})`, "DoD ARR % Change"];
  const lines = rows.map((entry) => {
    const dod = currency === "INR" ? entry.dodArrChangePctInr : entry.dodArrChangePctUsd;
    return [
      entry.date,
      currency === "INR" ? entry.arrInr : entry.arrUsd,
      currency === "INR" ? entry.mrrInr : entry.mrrUsd,
      (currency === "INR" ? entry.aovInr : entry.aovUsd).toFixed(2),
      dod === null ? "" : dod.toFixed(1),
    ].join(",");
  });
  return [header.join(","), ...lines].join("\n");
}

export function DataTable({ series, currency }: { series: DayMetrics[]; currency: Currency }) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedRows = useMemo(() => {
    const rows = [...series];
    rows.sort((a, b) => {
      const av = sortValue(a, sortColumn, currency);
      const bv = sortValue(b, sortColumn, currency);
      const comparison = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return rows;
  }, [series, sortColumn, currency, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const handleExport = () => {
    const csv = toCsv(sortedRows, currency);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const rangeLabel =
      sortedRows.length > 0
        ? `${sortedRows[sortedRows.length - 1]?.date}_to_${sortedRows[0]?.date}`
        : "no-data";
    link.href = url;
    link.download = `ira-arr-mrr-${currency.toLowerCase()}-${rangeLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-ink/10 bg-paper-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <p className="text-sm font-medium text-ink">day-wise breakdown</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={sortedRows.length === 0}
          className="rounded-full border border-ink/70 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-40"
        >
          export csv
        </button>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-paper text-left text-xs uppercase text-ink/50">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="flex items-center gap-1 hover:text-ink"
                  >
                    {column.label}
                    <SortIcon direction={sortColumn === column.key ? sortDirection : null} className="h-3 w-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {sortedRows.map((entry) => {
              const dod = currency === "INR" ? entry.dodArrChangePctInr : entry.dodArrChangePctUsd;
              const dodColor = dod === null ? "text-ink/40" : dod > 0 ? "text-positive" : dod < 0 ? "text-negative" : "text-ink/60";
              return (
                <tr key={entry.date} className="hover:bg-ink/5">
                  <td className="whitespace-nowrap px-4 py-2 text-ink/80">{formatDate(entry.date)}</td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink/80">
                    {formatCurrencyFull(currency === "INR" ? entry.arrInr : entry.arrUsd, currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink/80">
                    {formatCurrencyFull(currency === "INR" ? entry.mrrInr : entry.mrrUsd, currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink/80">
                    {formatCurrencyFull(currency === "INR" ? entry.aovInr : entry.aovUsd, currency)}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-2 tabular-nums font-medium ${dodColor}`}>
                    {formatPercent(dod)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
