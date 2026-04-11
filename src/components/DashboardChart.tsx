"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { periodo: string; valor: number };

export function DashboardChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return <p style={{ color: "#666" }}>Sem dados para o gráfico.</p>;
  }
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(v) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), "Valor"]}
          />
          <Line type="monotone" dataKey="valor" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
