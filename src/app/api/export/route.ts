import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getServerClient } from '@/lib/supabaseServer';
import { parseFilters, toRangeTimestamps } from '@/lib/filters';
import { CHANNEL_LABELS, OrderRow, STATUS_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Защитный предел, чтобы случайный экспорт без фильтров не выгрузил всё подряд.
const EXPORT_CAP = 50_000;
const PAGE = 1000;

interface ExportRecord {
  ID: number;
  Дата: Date;
  Клиент: string;
  Сегмент: string;
  Канал: string;
  Статус: string;
  Сумма: number;
}

/** Тянем все строки под текущими фильтрами постранично (по 1000). */
async function fetchAllRows(req: NextRequest): Promise<OrderRow[]> {
  const f = parseFilters(req.nextUrl.searchParams);
  const { fromTs, toTs } = toRangeTimestamps(f.from, f.to);
  const supabase = getServerClient();

  const out: OrderRow[] = [];

  for (let offset = 0; offset < EXPORT_CAP; offset += PAGE) {
    let query = supabase
      .from('orders')
      .select('id, customer_id, amount, status, channel, created_at, customers!inner(name, segment)')
      .gte('created_at', fromTs)
      .lt('created_at', toTs);

    if (f.status) query = query.eq('status', f.status);
    if (f.channel) query = query.eq('channel', f.channel);
    if (f.segment) query = query.eq('customers.segment', f.segment);

    query = query
      .order(f.sortBy, { ascending: f.sortOrder === 'asc' })
      .order('id', { ascending: f.sortOrder === 'asc' })
      .range(offset, offset + PAGE - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const batch = (data ?? []).map((r) => {
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
      } satisfies OrderRow;
    });

    out.push(...batch);
    if (batch.length < PAGE) break; // последняя страница
  }

  return out;
}

function toRecords(rows: OrderRow[]): ExportRecord[] {
  return rows.map((r) => ({
    ID: r.id,
    Дата: new Date(r.created_at),
    Клиент: r.customer_name ?? '—',
    Сегмент: r.segment ?? '—',
    Канал: CHANNEL_LABELS[r.channel] ?? r.channel,
    Статус: STATUS_LABELS[r.status] ?? r.status,
    Сумма: r.amount,
  }));
}

const HEADER = ['ID', 'Дата', 'Клиент', 'Сегмент', 'Канал', 'Статус', 'Сумма'] as const;

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** Проставляем числовые форматы для колонок «Дата» (B) и «Сумма» (G). */
function formatColumns(ws: XLSX.WorkSheet, rowCount: number) {
  for (let i = 0; i < rowCount; i++) {
    const row = i + 2; // +1 за заголовок, +1 за 1-индексацию
    const dateCell = ws[`B${row}`];
    if (dateCell) {
      dateCell.t = 'd';
      dateCell.z = 'dd.mm.yyyy hh:mm';
    }
    const amountCell = ws[`G${row}`];
    if (amountCell) {
      amountCell.t = 'n';
      amountCell.z = '#,##0.00';
    }
  }
  ws['!cols'] = [
    { wch: 8 }, // ID
    { wch: 18 }, // Дата
    { wch: 26 }, // Клиент
    { wch: 14 }, // Сегмент
    { wch: 16 }, // Канал
    { wch: 14 }, // Статус
    { wch: 14 }, // Сумма
  ];
}

export async function GET(req: NextRequest) {
  const format = (req.nextUrl.searchParams.get('format') ?? 'xlsx').toLowerCase();

  let rows: OrderRow[];
  try {
    rows = await fetchAllRows(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось выгрузить данные';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const records = toRecords(rows);

  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(records, { header: HEADER as unknown as string[] });
    const csv = XLSX.utils.sheet_to_csv(ws);
    // BOM, чтобы Excel корректно открыл UTF-8 (кириллица).
    const body = '\uFEFF' + csv;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="orders-${stamp()}.csv"`,
      },
    });
  }

  // XLSX: даты — настоящими датами, суммы — числами.
  const ws = XLSX.utils.json_to_sheet(records, {
    header: HEADER as unknown as string[],
    cellDates: true,
  });
  formatColumns(ws, records.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Заказы');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="orders-${stamp()}.xlsx"`,
    },
  });
}
