import { addDays, parseISO, subDays } from 'date-fns';
import {
  CHANNELS,
  Channel,
  Filters,
  Granularity,
  ORDER_STATUSES,
  OrderStatus,
  SEGMENTS,
  SORTABLE_COLUMNS,
  Segment,
  SortColumn,
  SortOrder,
} from './types';

const GRANULARITIES: Granularity[] = ['day', 'week', 'month'];

export const DEFAULTS = {
  granularity: 'day' as Granularity,
  page: 1,
  pageSize: 50,
  sortBy: 'created_at' as SortColumn,
  sortOrder: 'desc' as SortOrder,
};

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Дефолтный диапазон — последние 30 дней (включительно). */
export function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = subDays(to, 29);
  return { from: toDateString(from), to: toDateString(to) };
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Разбор фильтров из query-параметров (валидация + дефолты). */
export function parseFilters(sp: URLSearchParams): Filters {
  const def = defaultDateRange();

  const status = sp.get('status') as OrderStatus | null;
  const channel = sp.get('channel') as Channel | null;
  const segment = sp.get('segment') as Segment | null;
  const granularity = sp.get('granularity') as Granularity | null;
  const sortBy = sp.get('sortBy') as SortColumn | null;

  return {
    from: isValidDate(sp.get('from')) ? sp.get('from')! : def.from,
    to: isValidDate(sp.get('to')) ? sp.get('to')! : def.to,
    status: status && ORDER_STATUSES.includes(status) ? status : null,
    channel: channel && CHANNELS.includes(channel) ? channel : null,
    segment: segment && SEGMENTS.includes(segment) ? segment : null,
    granularity: granularity && GRANULARITIES.includes(granularity) ? granularity : DEFAULTS.granularity,
    page: clampInt(sp.get('page'), DEFAULTS.page, 1, 1_000_000),
    pageSize: clampInt(sp.get('pageSize'), DEFAULTS.pageSize, 10, 200),
    sortBy: sortBy && SORTABLE_COLUMNS.includes(sortBy) ? sortBy : DEFAULTS.sortBy,
    sortOrder: sp.get('sortOrder') === 'asc' ? 'asc' : DEFAULTS.sortOrder,
  };
}

function isValidDate(v: string | null): boolean {
  if (!v) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

/**
 * Каноническая query-строка: опускаем значения по умолчанию, чтобы ссылки были
 * короткими и стабильными (один и тот же набор фильтров → одна и та же строка,
 * это же используется как ключ кэша SWR / API).
 */
export function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  p.set('from', f.from);
  p.set('to', f.to);
  if (f.status) p.set('status', f.status);
  if (f.channel) p.set('channel', f.channel);
  if (f.segment) p.set('segment', f.segment);
  if (f.granularity !== DEFAULTS.granularity) p.set('granularity', f.granularity);
  if (f.page !== DEFAULTS.page) p.set('page', String(f.page));
  if (f.pageSize !== DEFAULTS.pageSize) p.set('pageSize', String(f.pageSize));
  if (f.sortBy !== DEFAULTS.sortBy) p.set('sortBy', f.sortBy);
  if (f.sortOrder !== DEFAULTS.sortOrder) p.set('sortOrder', f.sortOrder);
  return p.toString();
}

/**
 * Границы периода в timestamptz. `to` трактуется как включительный день,
 * поэтому верхняя граница — начало следующего дня (end-exclusive).
 * Используется единообразно и таблицей, и всеми RPC.
 */
export function toRangeTimestamps(from: string, to: string): { fromTs: string; toTs: string } {
  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = addDays(parseISO(`${to}T00:00:00.000Z`), 1).toISOString();
  return { fromTs, toTs };
}
