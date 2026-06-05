'use client';

import clsx from 'clsx';
import {
  CHANNEL_LABELS,
  Filters,
  OrderRow,
  OrdersResponse,
  STATUS_LABELS,
  SortColumn,
} from '@/lib/types';
import { formatDateTime, formatNum, formatRub } from '@/lib/format';

interface Props {
  data: OrdersResponse | undefined;
  committed: Filters;
  loading: boolean;
  onSort: (col: SortColumn) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

const COLUMNS: { key: SortColumn | 'customer_name' | 'segment'; label: string; sortable: boolean; align?: 'right' }[] = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'created_at', label: 'Дата', sortable: true },
  { key: 'customer_name', label: 'Клиент', sortable: false },
  { key: 'segment', label: 'Сегмент', sortable: false },
  { key: 'channel', label: 'Канал', sortable: true },
  { key: 'status', label: 'Статус', sortable: true },
  { key: 'amount', label: 'Сумма', sortable: true, align: 'right' },
];

// Цвет бейджа статуса.
const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  new: { bg: '#EDF0F4', fg: '#41566F' },
  processing: { bg: '#FBF1DC', fg: '#8A6418' },
  paid: { bg: '#E0F2F1', fg: '#15706B' },
  shipped: { bg: '#E6ECF4', fg: '#1F3A5F' },
  delivered: { bg: '#E4F2E9', fg: '#2F7A52' },
  cancelled: { bg: '#F0EEE8', fg: '#6E6A5F' },
  refunded: { bg: '#FBE6E3', fg: '#A83A30' },
};

function SortArrow({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-line">↕</span>;
  return <span className="ml-1 text-accent">{order === 'asc' ? '↑' : '↓'}</span>;
}

export default function OrdersTable({ data, committed, loading, onSort, onPage, onPageSize }: Props) {
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const { page, pageSize } = committed;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-display text-lg text-ink">Заказы</h2>
        <span className="text-sm text-muted tnum">{formatNum(total)} всего</span>
      </div>

      <div className={clsx('overflow-x-auto transition-opacity', loading && 'opacity-60')}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              {COLUMNS.map((c) => {
                const active = committed.sortBy === c.key;
                return (
                  <th
                    key={c.key}
                    className={clsx(
                      'whitespace-nowrap px-4 py-2.5 font-medium',
                      c.align === 'right' && 'text-right',
                      c.sortable && 'cursor-pointer select-none hover:text-ink',
                    )}
                    onClick={c.sortable ? () => onSort(c.key as SortColumn) : undefined}
                  >
                    {c.label}
                    {c.sortable && <SortArrow active={active} order={committed.sortOrder} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-muted">
                  {loading ? 'Загрузка…' : 'Ничего не найдено по текущим фильтрам'}
                </td>
              </tr>
            ) : (
              rows.map((r: OrderRow) => {
                const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.new;
                return (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-paper/60">
                    <td className="px-4 py-2.5 tnum text-muted">{r.id}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-ink">{r.customer_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{r.segment ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink">{CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ background: badge.bg, color: badge.fg }}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tnum font-medium text-ink">{formatRub(r.amount)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="tnum">
            {start}–{end} из {formatNum(total)}
          </span>
          <label className="flex items-center gap-1.5">
            <span>На странице:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="rounded-md border border-line bg-surface px-2 py-1 text-ink"
            >
              {[50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-line px-3 py-1 text-sm text-ink transition enabled:hover:bg-paper disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-sm text-muted tnum">
            {page} / {lastPage}
          </span>
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= lastPage}
            className="rounded-md border border-line px-3 py-1 text-sm text-ink transition enabled:hover:bg-paper disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      </div>
    </div>
  );
}
