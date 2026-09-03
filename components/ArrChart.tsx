"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrencyAbbreviated, formatCurrencyFull, formatDate } from "@/lib/format";
import type { Currency, DayMetrics, TimeOfDayPoint } from "@/lib/types";

import type { ChartMode } from "./ModeToggle";

const ARR_COLOR = "#1c1a14";
const DAY_DOT = { r: 3, strokeWidth: 0, fill: ARR_COLOR };

function dayWiseData(series: DayMetrics[], currency: Currency) {
  return series.map((entry) => ({ x: entry.date, arr: currency === "INR" ? entry.arrInr : entry.arrUsd }));
}

function timeWiseData(points: TimeOfDayPoint[], currency: Currency) {
  return points.map((point) => ({ x: point.timeOfDay, arr: currency === "INR" ? point.arrInr : point.arrUsd }));
}

/** Only draws a dot on the hour (HH:00) so 144 ten-minute points don't turn into a solid dotted line. */
function HourDot(props: { cx?: number; cy?: number; payload?: { x: string; arr: number | null }; index?: number }) {
  const { cx, cy, payload, index } = props;
  const shouldRender =
    typeof cx === "number" && typeof cy === "number" && payload && payload.arr !== null && payload.x.endsWith(":00");
  return <circle key={payload?.x ?? index} cx={cx ?? 0} cy={cy ?? 0} r={shouldRender ? 3 : 0} fill={ARR_COLOR} />;
}

export function ArrChart({
  mode,
  series,
  timeOfDayPoints,
  currency,
  onPointClick,
}: {
  mode: ChartMode;
  series: DayMetrics[];
  timeOfDayPoints: TimeOfDayPoint[];
  currency: Currency;
  onPointClick?: (x: string) => void;
}) {
  const chartData = mode === "day" ? dayWiseData(series, currency) : timeWiseData(timeOfDayPoints, currency);
  const xFormatter = mode === "day" ? formatDate : (v: string) => v;

  return (
    <div className="h-80 w-full rounded-3xl border border-ink/10 bg-paper-surface p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
          onClick={(state) => {
            const label = state?.activeLabel;
            if (onPointClick && typeof label === "string") onPointClick(label);
          }}
          style={{ cursor: onPointClick ? "pointer" : undefined }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1a1420" />
          <XAxis dataKey="x" tickFormatter={xFormatter} tick={{ fontSize: 12, fill: "#1c1a1499" }} minTickGap={24} />
          <YAxis
            tickFormatter={(v: number) => formatCurrencyAbbreviated(v, currency)}
            tick={{ fontSize: 12, fill: "#1c1a1499" }}
            width={72}
            domain={mode === "time" ? ["auto", "auto"] : undefined}
          />
          <Tooltip
            labelFormatter={(label: string) => (mode === "day" ? formatDate(label) : `time: ${label}`)}
            formatter={(value: unknown) => [typeof value === "number" ? formatCurrencyFull(value, currency) : "—", "arr"]}
            contentStyle={{ backgroundColor: "#faf7ec", border: "1px solid #1c1a1420", borderRadius: 12 }}
          />
          <Line
            type="monotone"
            dataKey="arr"
            stroke={ARR_COLOR}
            strokeWidth={2}
            dot={mode === "day" ? DAY_DOT : HourDot}
            activeDot={{ r: 5 }}
            connectNulls={mode === "time"}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
