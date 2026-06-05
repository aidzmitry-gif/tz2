'use client';

import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AnalyticsResponse,
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  Channel,
  Granularity,
  STATUS_LABELS,
} from '@/lib/types';
import { formatBucket, formatNum, formatRub, formatRubCompact, formatPercent } from '@/lib/format';

const AXIS = '#6E6A5F';
const GRID = '#E7E2D6';

// Палитра стадий воронки — от светлого к насыщенному navy.
const FUNNEL_COLORS = ['#9DB4CE', '#6E8FB5', '#477199', '#2F5680', '#1F3A5F'];

function ChartTooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${GRID}`,
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 13,
        boxShadow: '0 6px 20px rgba(27,26,22,0.08)',
      }}
    >
      {children}
    </div>
  );
}

// --- Выручка по периодам ----------------------------------------------------

interface RevenueProps {
  data: AnalyticsResponse['revenue'];
  granularity: Granularity;
}

export function RevenueChart({ data, granularity }: RevenueProps) {
  if (!data.length) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F3A5F" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#1F3A5F" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(v) => formatBucket(v, granularity)}
          tick={{ fill: AXIS, fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={24}
        />
        <YAxis
          yAxisId="rev"
          tickFormatter={(v) => formatRubCompact(v)}
          tick={{ fill: AXIS, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <YAxis
          yAxisId="ord"
          orientation="right"
          tickFormatter={(v) => formatNum(v)}
          tick={{ fill: AXIS, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const rev = payload.find((p) => p.dataKey === 'revenue')?.value as number;
            const ord = payload.find((p) => p.dataKey === 'orders')?.value as number;
            return (
              <ChartTooltipShell>
                <div style={{ color: '#1B1A16', fontWeight: 600, marginBottom: 4 }}>
                  {formatBucket(String(label), granularity)}
                </div>
                <div style={{ color: '#1F3A5F' }}>Выручка: {formatRub(rev)}</div>
                <div style={{ color: '#6E6A5F' }}>Заказов: {formatNum(ord)}</div>
              </ChartTooltipShell>
            );
          }}
        />
        <Area
          yAxisId="rev"
          type="monotone"
          dataKey="revenue"
          stroke="#1F3A5F"
          strokeWidth={2}
          fill="url(#revFill)"
        />
        <Line
          yAxisId="ord"
          type="monotone"
          dataKey="orders"
          stroke="#C08A2E"
          strokeWidth={1.5}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- Воронка конверсии ------------------------------------------------------

interface FunnelProps {
  data: AnalyticsResponse['funnel'];
}

export function ConversionFunnelChart({ data }: FunnelProps) {
  if (!data.length) return <EmptyState />;

  const top = data[0]?.reached || 0;
  const chartData = data.map((d, i) => {
    const pct = top > 0 ? (d.reached / top) * 100 : 0;
    return {
      name: STATUS_LABELS[d.stage as keyof typeof STATUS_LABELS] ?? d.stage,
      value: d.reached,
      pct,
      leftLabel: `${formatNum(d.reached)} (${formatPercent(pct)})`,
      fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <FunnelChart>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { name: string; value: number; pct: number };
            return (
              <ChartTooltipShell>
                <div style={{ color: '#1B1A16', fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: '#6E6A5F' }}>
                  {formatNum(p.value)} • {formatPercent(p.pct)}
                </div>
              </ChartTooltipShell>
            );
          }}
        />
        <Funnel dataKey="value" data={chartData} isAnimationActive>
          <LabelList
            position="right"
            fill="#1B1A16"
            stroke="none"
            fontSize={13}
            dataKey="name"
          />
          <LabelList
            position="left"
            fill="#6E6A5F"
            stroke="none"
            fontSize={12}
            dataKey="leftLabel"
          />
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

// --- Распределение по каналам ----------------------------------------------

interface ChannelProps {
  data: AnalyticsResponse['channels'];
}

export function ChannelChart({ data }: ChannelProps) {
  if (!data.length) return <EmptyState />;

  const total = data.reduce((s, d) => s + d.revenue, 0);
  const chartData = data.map((d) => ({
    name: CHANNEL_LABELS[d.channel] ?? d.channel,
    channel: d.channel,
    value: d.revenue,
    orders: d.orders,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={64}
          outerRadius={100}
          paddingAngle={2}
          stroke="#FFFFFF"
          strokeWidth={2}
        >
          {chartData.map((entry) => (
            <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel as Channel] ?? '#5B667A'} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { name: string; value: number; orders: number };
            const share = total > 0 ? (p.value / total) * 100 : 0;
            return (
              <ChartTooltipShell>
                <div style={{ color: '#1B1A16', fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: '#1F3A5F' }}>{formatRub(p.value)}</div>
                <div style={{ color: '#6E6A5F' }}>
                  {formatPercent(share)} • {formatNum(p.orders)} зак.
                </div>
              </ChartTooltipShell>
            );
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span style={{ color: '#1B1A16', fontSize: 13 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6E6A5F',
        fontSize: 14,
      }}
    >
      Нет данных за выбранный период
    </div>
  );
}
