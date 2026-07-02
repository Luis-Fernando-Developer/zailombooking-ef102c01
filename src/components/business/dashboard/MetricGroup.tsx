import { useState, ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent } from "@/components/ui/card";
import { Hash, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LabelList,
} from "recharts";

export type MetricGroupView = "numbers" | "chart";

interface MetricGroupProps {
  title: ReactNode;
  numbers: ReactNode;
  chart?: ReactNode;
  storageKey?: string;
  defaultView?: MetricGroupView;
}

export function MetricGroup({
  title, numbers, chart, storageKey, defaultView = "numbers",
}: MetricGroupProps) {
  const [view, setView] = useState<MetricGroupView>(() => {
    if (!storageKey) return defaultView;
    try {
      const saved = localStorage.getItem(`dash:view:${storageKey}`);
      return (saved === "chart" || saved === "numbers") ? saved : defaultView;
    } catch { return defaultView; }
  });

  const handleChange = (v: string) => {
    if (v !== "numbers" && v !== "chart") return;
    setView(v);
    if (storageKey) {
      try { localStorage.setItem(`dash:view:${storageKey}`, v); } catch {}
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-gradient">{title}</h2>
        {chart && (
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={handleChange}
            className="bg-card/50 border border-primary/20 rounded-md p-0.5"
          >
            <ToggleGroupItem
              value="numbers"
              size="sm"
              className="gap-1.5 h-8 data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
              aria-label="Ver em números"
            >
              <Hash className="h-3.5 w-3.5" />
              <span className="text-xs">Números</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="chart"
              size="sm"
              className="gap-1.5 h-8 data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
              aria-label="Ver em gráfico"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="text-xs">Gráfico</span>
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      {view === "chart" && chart ? chart : numbers}
    </section>
  );
}

// ─── Shared chart helpers ─────────────────────────────────────────────────────
const PALETTE = [
  "hsl(var(--primary))",
  "#10b981", // green
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ec4899", // pink
  "#ef4444", // red
  "#8b5cf6", // purple
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--primary) / 0.3)",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
  fontSize: 12,
};

function ChartCard({ children, height = 300 }: { children: ReactNode; height?: number }) {
  return (
    <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
      <CardContent className="p-6" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Charts ─────────────────────────────────────────────────────────────────
export function PieDistribution({
  data, valueFormatter,
}: {
  data: { name: string; value: number }[];
  valueFormatter?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ChartCard>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={65}
          outerRadius={110}
          paddingAngle={2}
          label={(e: any) => {
            if (total <= 0) return "";
            const pct = ((e.value / total) * 100).toFixed(0);
            const val = valueFormatter ? valueFormatter(e.value) : e.value;
            return `${e.name}: ${val} (${pct}%)`;
          }}
          labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
          style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="hsl(var(--background))" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: any, n: any) => [valueFormatter ? valueFormatter(Number(v)) : v, n]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
      </PieChart>
    </ChartCard>
  );
}

export function BarRanking({
  data, layout = "horizontal", valueFormatter, color,
}: {
  data: { name: string; value: number }[];
  layout?: "horizontal" | "vertical";
  valueFormatter?: (v: number) => string;
  color?: string;
}) {
  const isVertical = layout === "vertical";
  return (
    <ChartCard height={Math.max(300, data.length * 42 + 60)}>
      <BarChart data={data} layout={isVertical ? "vertical" : "horizontal"} margin={{ top: 10, right: 20, bottom: 10, left: isVertical ? 100 : 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary) / 0.1)" />
        {isVertical ? (
          <>
            <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={valueFormatter} />
            <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={100} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={valueFormatter} />
          </>
        )}
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "hsl(var(--primary) / 0.05)" }}
          formatter={(v: any) => valueFormatter ? valueFormatter(Number(v)) : v}
        />
        <Bar dataKey="value" radius={[6, 6, 6, 6]} fill={color ?? "hsl(var(--primary))"}>
          {data.map((_, i) => (
            <Cell key={i} fill={color ?? PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

export function EmptyChart({ message = "Sem dados no período" }: { message?: string }) {
  return (
    <Card className="bg-card/50 border-primary/20">
      <CardContent className="p-12 text-center text-muted-foreground text-sm">{message}</CardContent>
    </Card>
  );
}
