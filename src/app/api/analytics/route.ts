import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getServerClient } from '@/lib/supabaseServer';
import { parseFilters, toRangeTimestamps } from '@/lib/filters';
import {
  AnalyticsResponse,
  ChannelSlice,
  Channel,
  FunnelStage,
  Granularity,
  OrderStatus,
  RevenuePoint,
  Segment,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface AnalyticsArgs {
  fromTs: string;
  toTs: string;
  granularity: Granularity;
  status: OrderStatus | null;
  channel: Channel | null;
  segment: Segment | null;
}

/**
 * Тяжёлые агрегаты считаются тремя RPC параллельно и кэшируются на 60 секунд.
 * Ключ кэша включает все параметры фильтра (см. массив тегов), поэтому разные
 * фильтры не перетирают друг друга.
 */
async function computeAnalytics(args: AnalyticsArgs): Promise<AnalyticsResponse> {
  const supabase = getServerClient();
  const { fromTs, toTs, granularity, status, channel, segment } = args;

  const [revenueRes, funnelRes, channelRes] = await Promise.all([
    supabase.rpc('revenue_by_period', {
      p_from: fromTs,
      p_to: toTs,
      p_granularity: granularity,
      p_status: status,
      p_channel: channel,
      p_segment: segment,
    }),
    supabase.rpc('conversion_funnel', {
      p_from: fromTs,
      p_to: toTs,
      p_channel: channel,
      p_segment: segment,
    }),
    supabase.rpc('channel_distribution', {
      p_from: fromTs,
      p_to: toTs,
      p_status: status,
      p_segment: segment,
    }),
  ]);

  if (revenueRes.error) throw new Error(revenueRes.error.message);
  if (funnelRes.error) throw new Error(funnelRes.error.message);
  if (channelRes.error) throw new Error(channelRes.error.message);

  const revenue: RevenuePoint[] = (revenueRes.data ?? []).map((r: Record<string, unknown>) => ({
    bucket: r.bucket as string,
    revenue: Number(r.revenue),
    orders: Number(r.orders),
  }));

  const funnel: FunnelStage[] = (funnelRes.data ?? []).map((r: Record<string, unknown>) => ({
    stage: r.stage as string,
    stage_order: Number(r.stage_order),
    reached: Number(r.reached),
  }));

  const channels: ChannelSlice[] = (channelRes.data ?? []).map((r: Record<string, unknown>) => ({
    channel: r.channel as Channel,
    revenue: Number(r.revenue),
    orders: Number(r.orders),
  }));

  return { revenue, funnel, channels };
}

export async function GET(req: NextRequest) {
  const f = parseFilters(req.nextUrl.searchParams);
  const { fromTs, toTs } = toRangeTimestamps(f.from, f.to);

  const args: AnalyticsArgs = {
    fromTs,
    toTs,
    granularity: f.granularity,
    status: f.status,
    channel: f.channel,
    segment: f.segment,
  };

  // Ключ кэша — стабильная сериализация аргументов.
  const cacheKey = JSON.stringify(args);
  const cached = unstable_cache(
    () => computeAnalytics(args),
    ['analytics-v1', cacheKey],
    { revalidate: 60, tags: ['analytics'] },
  );

  try {
    const body = await cached();
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось посчитать аналитику';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
