import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { YearMetrics } from "@/lib/society/types";

const CHARTS: { key: keyof YearMetrics; label: string; fmt: (v: number) => string }[] = [
  { key: "papers", label: "投稿数 papers", fmt: (v) => String(v) },
  { key: "Gini", label: "被引用の偏り Gini", fmt: (v) => v.toFixed(2) },
  { key: "H", label: "採択分野のエントロピー H（bit）", fmt: (v) => v.toFixed(2) },
  { key: "hit", label: "当たり hit", fmt: (v) => String(v) },
  { key: "fraud_rate", label: "再現できない採択 fraud_rate", fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "pluralism", label: "多様性 pluralism", fmt: (v) => v.toFixed(2) },
];

export function MetricsCharts({ history }: { history: YearMetrics[] }) {
  return (
    <div className="flex flex-col gap-4">
      {CHARTS.map((c) => {
        const last = history[history.length - 1];
        return (
          <figure key={c.key} className="rounded-xl border p-3">
            <figcaption className="flex items-baseline justify-between text-sm">
              <span>{c.label}</span>
              <span className="font-mono font-bold">{c.fmt(Number(last[c.key]))}</span>
            </figcaption>
            <div className="h-24" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={(y) => `Y${y}`} />
                  <YAxis tick={{ fontSize: 10 }} width={48} />
                  <Tooltip formatter={(v: number) => c.fmt(v)} labelFormatter={(y) => `Year ${y}`} />
                  <Line type="monotone" dataKey={c.key} stroke="#1A2B6B" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="sr-only">
              {c.label}の推移: {history.map((m) => `Year ${m.year} ${c.fmt(Number(m[c.key]))}`).join("、")}
            </p>
          </figure>
        );
      })}
    </div>
  );
}
