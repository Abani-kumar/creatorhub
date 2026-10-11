'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayKey, money, moneyCompact, num } from '@/lib/format';

export interface Point { date: string; value: number }

function Tip({ active, payload, metric }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Point }>; metric: 'revenue' | 'purchases' }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg bg-night px-3 py-2 text-white shadow-pop">
      <p className="text-xs text-night-text">{formatDayKey(p.date)}</p>
      <p className="font-display text-base font-semibold tabular-nums">
        {metric === 'revenue' ? money(p.value) : `${num(p.value)} ${p.value === 1 ? 'purchase' : 'purchases'}`}
      </p>
    </div>
  );
}

/** Loaded lazily (recharts is the heaviest dependency on the dashboard). The hover cursor is the rose "playhead". */
export default function PerformanceChartInner({ data, metric }: { data: Point[]; metric: 'revenue' | 'purchases' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15162b" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#15162b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e1e4ec" strokeDasharray="3 5" />
        <XAxis dataKey="date" tickFormatter={formatDayKey} tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} tick={{ fill: '#5f637e', fontSize: 12 }} />
        <YAxis
          width={metric === 'revenue' ? 54 : 30}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tick={{ fill: '#5f637e', fontSize: 12 }}
          tickFormatter={(v: number) => (metric === 'revenue' ? moneyCompact(v * 100) : String(v))}
        />
        <Tooltip content={<Tip metric={metric} />} cursor={{ stroke: '#e0245e', strokeWidth: 1.5 }} wrapperStyle={{ outline: 'none' }} isAnimationActive={false} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#15162b"
          strokeWidth={2}
          fill="url(#perfFill)"
          dot={false}
          activeDot={{ r: 5, fill: '#e0245e', stroke: '#fff', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
