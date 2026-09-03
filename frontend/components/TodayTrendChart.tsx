"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrencyAbbreviated, formatCurrencyFull } from "@/lib/format";
import type { IntradayTrendPoint } from "@/lib/types";

import { EmptyState } from "./EmptyState";

function hourlyTicks(points: IntradayTrendPoint[]): string[] {
  return points.filter((_, index) => index % 12 === 0).map((point) => point.timeOfDay);
}

export function TodayTrendChart({ points }: { points: IntradayTrendPoint[] }) {
  const hasAnyData = points.some((point) => point.todayArrUsd !== null || point.trendArrUsd !== null);

  return (
    <div className="rounded-3xl border border-ink/10 bg-paper-surface p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-sm font-semibold text-ink">today&apos;s ARR, by time of day</p>
        <div className="flex items-center gap-4 text-xs text-ink/50">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-ink" /> today
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full border-t-2 border-dotted border-ink/50" /> last 3 days avg
          </span>
        </div>
      </div>
      {hasAnyData ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1c1a1420" />
              <XAxis
                dataKey="timeOfDay"
                ticks={hourlyTicks(points)}
                interval="preserveStartEnd"
                tick={{ fontSize: 12, fill: "#1c1a1499" }}
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrencyAbbreviated(v, "USD")}
                tick={{ fontSize: 12, fill: "#1c1a1499" }}
                width={72}
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  typeof value === "number" ? formatCurrencyFull(value, "USD") : "—",
                  String(name),
                ]}
                labelFormatter={(label: string) => `time: ${label}`}
                contentStyle={{ backgroundColor: "#faf7ec", border: "1px solid #1c1a1420", borderRadius: 12 }}
              />
              <Line
                type="monotone"
                dataKey="trendArrUsd"
                name="last 3 days avg"
                stroke="#1c1a1480"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="todayArrUsd"
                name="today"
                stroke="#1c1a14"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState title="no intraday data yet" message="the 10-minute feed hasn't reported any buckets yet today." />
      )}
    </div>
  );
}
