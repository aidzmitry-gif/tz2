import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { parseFilters, toRangeTimestamps } from '@/lib/filters';
import { OrderRow, OrdersResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req.nextUrl.searchParams);
  const { fromTs, toTs } = toRangeTimestamps(f.from, f.to);
  const supabase = getServerClient();

  // Серверная пагинация (range) + сортировка. На клиент уходит только страница.
  let query = supabase
    .from('orders')
    .select('id, customer_id, amount, status, channel, created_at, customers!inner(name, segment)', {
      count: 'exact',
    })
    .gte('created_at', fromTs)
    .lt('created_at', toTs);

  if (f.status) query = query.eq('status', f.status);
  if (f.channel) query = query.eq('channel', f.channel);
  if (f.segment) query = query.eq('customers.segment', f.segment);

  query = query
    .order(f.sortBy, { ascending: f.sortOrder === 'asc' })
    .order('id', { ascending: f.sortOrder === 'asc' }); // стабильный tiebreaker

  const fromIdx = (f.page - 1) * f.pageSize;
  query = query.range(fromIdx, fromIdx + f.pageSize - 1);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: OrderRow[] = (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const cust = Array.isArray(rec.customers) ? rec.customers[0] : rec.customers;
    const customer = (cust ?? {}) as { name?: string; segment?: string };
    return {
      id: Number(rec.id),
      customer_id: Number(rec.customer_id),
      customer_name: customer.name ?? null,
      segment: (customer.segment as OrderRow['segment']) ?? null,
      amount: Number(rec.amount),
      status: rec.status as OrderRow['status'],
      channel: rec.channel as OrderRow['channel'],
      created_at: rec.created_at as string,
    };
  });

  const body: OrdersResponse = {
    rows,
    total: count ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=60' },
  });
}
