import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getServerClient } from '@/lib/supabaseServer';
import { parseFilters, toRangeTimestamps } from '@/lib/filters';
import { Channel, ComparisonResponse, OrderStatus, Segment } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ComparisonArgs {
  fromTs: string;
  toTs: string;
  status: OrderStatus | null;
  channel: Channel | null;
  segment: Segment | null;
}

/**
 * Сравнение "текущий vs предыдущий" период равной длины. Вся арифметика границ
 * и агрегация — в одном RPC (period_comparison), который возвращает готовый JSON.
 */
async function computeComparison(args: ComparisonArgs): Promise<ComparisonResponse> {
  const supabase = getServerClient();
  const { fromTs, toTs, status, channel, segment } = args;

  const { data, error } = await supabase.rpc('period_comparison', {
    p_from: fromTs,
    p_to: toTs,
    p_status: status,
    p_channel: channel,
    p_segment: segment,
  });

  if (error) throw new Error(error.message);
  return data as ComparisonResponse;
}

export async function GET(req: NextRequest) {
  const f = parseFilters(req.nextUrl.searchParams);
  const { fromTs, toTs } = toRangeTimestamps(f.from, f.to);

  const args: ComparisonArgs = {
    fromTs,
    toTs,
    status: f.status,
    channel: f.channel,
    segment: f.segment,
  };

  const cacheKey = JSON.stringify(args);
  const cached = unstable_cache(
    () => computeComparison(args),
    ['comparison-v1', cacheKey],
    { revalidate: 60, tags: ['comparison'] },
  );

  try {
    const body = await cached();
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось посчитать сравнение периодов';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
