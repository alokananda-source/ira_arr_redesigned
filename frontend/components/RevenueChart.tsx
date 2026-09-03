"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrencyAbbreviated, formatCurrencyFull, formatDate } from "@/lib/format";
import type { Currency, DayMetrics } from "@/lib/types";

const ARR_COLOR = "#1c1a14";
const MRR_COLOR = "#b5751f";

export function RevenueChart({ series, currency }: { series: DayMetrics[]; currency: Currency }) {
  const chartData = series.map((entry) => ({
    date: entry.date,
    arr: currency === "INR" ? entry.arrInr : entry.arrUsd,
    mrr: currency === "INR" ? entry.mrrInr : entry.mrrUsd,
  }));

  return (
    <div className="h-80 w-full rounded-3xl border border-ink/10 bg-paper-surface p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-4 px-2 text-xs text-ink/50">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: ARR_COLOR }} /> arr (left axis)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: MRR_COLOR }} /> mrr (right axis)
        </span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1a1420" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 12, fill: "#1c1a1499" }}
            minTickGap={24}
          />
          <YAxis
            yAxisId="arr"
            orientation="left"
            tickFormatter={(v: number) => formatCurrencyAbbreviated(v, currency)}
            tick={{ fontSize: 12, fill: ARR_COLOR }}
            width={72}
          />
          <YAxis
            yAxisId="mrr"
            orientation="right"
            tickFormatter={(v: number) => formatCurrencyAbbreviated(v, currency)}
            tick={{ fontSize: 12, fill: MRR_COLOR }}
            width={72}
          />
          <Tooltip
            labelFormatter={(label: string) => formatDate(label)}
            formatter={(value: number, name: string) => [formatCurrencyFull(value, currency), name.toUpperCase()]}
            contentStyle={{ backgroundColor: "#faf7ec", border: "1px solid #1c1a1420", borderRadius: 12 }}
          />
          <Line yAxisId="arr" type="monotone" dataKey="arr" name="arr" stroke={ARR_COLOR} strokeWidth={2} dot={false} />
          <Line yAxisId="mrr" type="monotone" dataKey="mrr" name="mrr" stroke={MRR_COLOR} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
