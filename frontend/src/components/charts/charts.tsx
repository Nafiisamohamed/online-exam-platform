"use client";

/**
 * Reusable charts (Recharts) in the platform style. Colours come from the
 * --chart-* CSS variables, so the same chart works in light and dark mode.
 * Every chart is responsive and has a styled tooltip; series can be labelled
 * for the legend.
 *
 * Data is passed in by the page, which gets it from the API. These components
 * never invent numbers.
 */
import { useSyncExternalStore } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export interface Series {
  key: string;
  label: string;
  color?: string;
}

type Row = Record<string, string | number>;

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
/** Charts animate in, unless the user has asked their system for reduced motion. */
function useChartAnimation() {
  return !useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED).matches, () => false);
}

const axis = { stroke: "var(--text-subtle)", fontSize: 12, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, valueSuffix }: TooltipContentProps & { valueSuffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-raised">
      {label !== undefined && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey ?? p.name)} className="flex items-center gap-2 text-text">
          <span className="h-2 w-2 rounded-full" style={{ background: (p.color as string) ?? (p.payload as { fill?: string })?.fill }} aria-hidden />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-semibold text-foreground">
            {p.value}
            {valueSuffix}
          </span>
        </p>
      ))}
    </div>
  );
}

function LegendLabel(value: string) {
  return <span className="text-xs text-muted">{value}</span>;
}

/** Vertical bars: one or more series per category (e.g. score bands, courses). */
export function BarChartView({ data, xKey, series, valueSuffix, stacked }: { data: Row[]; xKey: string; series: Series[]; valueSuffix?: string; stacked?: boolean }) {
  const animate = useChartAnimation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={44} />
        <Tooltip cursor={{ fill: "var(--accent-soft)" }} content={(p) => <ChartTooltip {...p} valueSuffix={valueSuffix} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} formatter={LegendLabel} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={stacked ? 0 : [6, 6, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={44} isAnimationActive={animate} animationDuration={600} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars, good for long labels such as question numbers or course names. */
export function HorizontalBarChartView({ data, yKey, series, valueSuffix, domainMax }: { data: Row[]; yKey: string; series: Series[]; valueSuffix?: string; domainMax?: number }) {
  const animate = useChartAnimation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" {...axis} domain={[0, domainMax ?? "auto"]} />
        <YAxis type="category" dataKey={yKey} {...axis} width={64} />
        <Tooltip cursor={{ fill: "var(--accent-soft)" }} content={(p) => <ChartTooltip {...p} valueSuffix={valueSuffix} />} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive={animate} animationDuration={600} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Line / area trend over time (e.g. average score per exam). */
export function TrendChartView({ data, xKey, series, valueSuffix }: { data: Row[]; xKey: string; series: Series[]; valueSuffix?: string }) {
  const animate = useChartAnimation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={44} />
        <Tooltip content={(p) => <ChartTooltip {...p} valueSuffix={valueSuffix} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} formatter={LegendLabel} />}
        {series.map((s, i) => {
          const color = s.color ?? CHART_COLORS[i % CHART_COLORS.length];
          return (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color} strokeWidth={2.5} fill={`url(#fill-${s.key})`} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={animate} animationDuration={700} />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut with the total in the middle (e.g. share of students per grade). */
export function DonutChartView({ data, nameKey, valueKey, centerLabel, centerValue }: { data: Row[]; nameKey: string; valueKey: string; centerLabel?: string; centerValue?: string | number }) {
  const animate = useChartAnimation();
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={(p) => <ChartTooltip {...p} />} />
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={animate} animationDuration={700}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={LegendLabel} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue !== undefined && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 text-center">
          <p className="text-2xl font-bold text-foreground">{centerValue}</p>
          {centerLabel && <p className="text-xs text-muted">{centerLabel}</p>}
        </div>
      )}
    </div>
  );
}
