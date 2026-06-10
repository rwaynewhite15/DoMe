"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MemberRef, TrendBucket } from "@/lib/points";

export function PointsChart({
  daily,
  cumulative,
  members,
}: {
  daily: TrendBucket[];
  cumulative: TrendBucket[];
  members: MemberRef[];
}) {
  const [mode, setMode] = useState<"cumulative" | "daily">("cumulative");
  const data = mode === "cumulative" ? cumulative : daily;

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-zinc-700">
          Points {mode === "cumulative" ? "over time" : "per day"}
        </span>
        <div className="flex rounded-lg border border-border p-0.5 text-xs">
          {(["cumulative", "daily"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2 py-1 font-medium capitalize ${
                mode === m ? "bg-primary text-white" : "text-zinc-500"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              allowDecimals={false}
              width={40}
              label={{
                value: "Points",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#71717a", textAnchor: "middle" },
              }}
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {members.map((m) => (
              <Line
                key={m.id}
                type="monotone"
                dataKey={m.id}
                name={m.name}
                stroke={m.color}
                strokeWidth={2.5}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
