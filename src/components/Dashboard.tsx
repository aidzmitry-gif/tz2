'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CHANNELS,
  CHANNEL_LABELS,
  Filters,
  GRANULARITY_LABELS,
  Granularity,
  ORDER_STATUSES,
  SEGMENTS,
  STATUS_LABELS,
  SortColumn,
} from '@/lib/types';
import { buildQuery, parseFilters } from '@/lib/filters';
import {
  deltaPercent,
  formatNum,
  formatPercent,
  formatRub,
  formatSignedPercent,
} from '@/lib/format';
import { useAnalytics, useComparison, useDebounce, useOrders } from '@/hooks/useDashboardData';
import OrdersTable from './OrdersTable';
import { ChannelChart, ConversionFunnelChart, RevenueChart } from './Charts';

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // URL — единственный источник истины для применённых фильтров.
  const committed = useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);
  const query = useMemo(() => buildQuery(committed), [committed]);

  const { data: orders, isLoading: ordersLoading, error: ordersError } = useOrders(query);
  const { data: analytics } = useAnalytics(query);
  const { data: comparison } = useComparison(query);

  /** Запись частичных изменений фильтра в URL (router.replace, без скролла). */
  const updateUrl = useCallback(
    (partial: Partial<Filters>, resetPage = true) => {
      const next: Filters = { ...committed, ...partial };
      if (resetPage) next.page = 1;
      const qs = buildQuery(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [committed, pathname, router],
  );

  // --- Даты: локальный черновик + дебаунс, чтобы не спамить запросами ---------
  const [dateDraft, setDateDraft] = useState({ from: committed.from, to: committed.to });
  const debouncedDates = useDebounce(dateDraft, 450);

  // Синхронизируем черновик, если даты изменились извне (например, кнопкой «Сбросить»).
  useEffect(() => {
    setDateDraft({ from: committed.from, to: committed.to });
  }, [committed.from, committed.to]);

  // Пушим продебаунсенные даты в URL — но только если реально отличаются (нет петли).
  useEffect(() => {
    if (debouncedDates.from === committed.from && debouncedDates.to === committed.to) return;
    if (!debouncedDates.from || !debouncedDates.to) return;
    updateUrl({ from: debouncedDates.from, to: debouncedDates.to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDates]);

  // --- Обработчики таблицы ----------------------------------------------------
  const onSort = useCallback(
    (col: SortColumn) => {
      if (committed.sortBy === col) {
        updateUrl({ sortOrder: committed.sortOrder === 'asc' ? 'desc' : 'asc' }, false);
      } else {
        updateUrl({ sortBy: col, sortOrder: 'desc' }, false);
      }
    },
    [committed.sortBy, committed.sortOrder, updateUrl],
  );

  const onPage = useCallback((page: number) => updateUrl({ page }, false), [updateUrl]);
  const onPageSize = useCallback((pageSize: number) => updateUrl({ pageSize }), [updateUrl]);

  const resetAll = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  // --- KPI из сравнения -------------------------------------------------------
  const kpis = useMemo(() => buildKpis(comparison), [comparison]);

  return (
    <div className="flex flex-col gap-6">
      {/* Панель фильтров */}
      <section className="panel px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <Field label="Период с">
            <input
              type="date"
              value={dateDraft.from}
              max={dateDraft.to}
              onChange={(e) => setDateDraft((d) => ({ ...d, from: e.target.value }))}
              className="input"
            />
          </Field>
          <Field label="по">
            <input
              type="date"
              value={dateDraft.to}
              min={dateDraft.from}
              onChange={(e) => setDateDraft((d) => ({ ...d, to: e.target.value }))}
              className="input"
            />
          </Field>

          <Field label="Статус">
            <select
              value={committed.status ?? ''}
              onChange={(e) => updateUrl({ status: (e.target.value || null) as Filters['status'] })}
              className="input"
            >
              <option value="">Все</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Канал">
            <select
              value={committed.channel ?? ''}
              onChange={(e) => updateUrl({ channel: (e.target.value || null) as Filters['channel'] })}
              className="input"
            >
              <option value="">Все</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Сегмент">
            <select
              value={committed.segment ?? ''}
              onChange={(e) => updateUrl({ segment: (e.target.value || null) as Filters['segment'] })}
              className="input"
            >
              <option value="">Все</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <button
            onClick={resetAll}
            className="ml-auto self-end rounded-md border border-line px-3 py-2 text-sm text-muted transition hover:bg-paper hover:text-ink"
          >
            Сбросить
          </button>
        </div>
      </section>

      {/* KPI + сравнение периодов */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </section>

      {ordersError && (
        <div className="panel border-negative/40 bg-negative/5 px-5 py-4 text-sm text-negative">
          Ошибка загрузки данных: {ordersError.message}. Проверьте, что заданы переменные окружения
          Supabase и применены миграции.
        </div>
      )}

      {/* Графики */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="panel px-5 py-4 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Выручка и заказы</h2>
            <div className="flex gap-1">
              {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => updateUrl({ granularity: g }, false)}
                  className={clsx(
                    'rounded-md px-3 py-1 text-sm transition',
                    committed.granularity === g
                      ? 'bg-accent text-white'
                      : 'border border-line text-muted hover:bg-paper hover:text-ink',
                  )}
                >
                  {GRANULARITY_LABELS[g]}
                </button>
              ))}
            </div>
          </div>
          <RevenueChart data={analytics?.revenue ?? []} granularity={committed.granularity} />
        </div>

        <div className="panel px-5 py-4 xl:col-span-2">
          <h2 className="mb-3 font-display text-lg text-ink">Воронка конверсии</h2>
          <ConversionFunnelChart data={analytics?.funnel ?? []} />
        </div>

        <div className="panel px-5 py-4">
          <h2 className="mb-3 font-display text-lg text-ink">Каналы (по выручке)</h2>
          <ChannelChart data={analytics?.channels ?? []} />
        </div>
      </section>

      {/* Экспорт */}
      <section className="panel flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg text-ink">Экспорт выборки</h2>
          <p className="text-sm text-muted">
            Выгружается текущая отфильтрованная выборка
            {orders ? ` — ${formatNum(orders.total)} строк` : ''}.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/export?${query}&format=xlsx`} className="btn-accent" download>
            Excel (.xlsx)
          </a>
          <a href={`/api/export?${query}&format=csv`} className="btn-outline" download>
            CSV
          </a>
        </div>
      </section>

      {/* Таблица */}
      <OrdersTable
        data={orders}
        committed={committed}
        loading={ordersLoading}
        onSort={onSort}
        onPage={onPage}
        onPageSize={onPageSize}
      />
    </div>
  );
}

// --- Вспомогательные компоненты ---------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

interface Kpi {
  label: string;
  value: string;
  delta: number | null;
  deltaLabel: string;
  unit: 'percent' | 'pp';
}

function buildKpis(comparison: ReturnType<typeof useComparison>['data']): Kpi[] {
  const cur = comparison?.current;
  const prev = comparison?.previous;

  const curAvg = cur && cur.orders > 0 ? cur.revenue / cur.orders : 0;
  const prevAvg = prev && prev.orders > 0 ? prev.revenue / prev.orders : 0;
  const curConv = cur && cur.orders > 0 ? (cur.conversions / cur.orders) * 100 : 0;
  const prevConv = prev && prev.orders > 0 ? (prev.conversions / prev.orders) * 100 : 0;

  return [
    {
      label: 'Выручка',
      value: formatRub(cur?.revenue ?? 0),
      delta: cur && prev ? deltaPercent(cur.revenue, prev.revenue) : null,
      deltaLabel: 'к пред. периоду',
      unit: 'percent',
    },
    {
      label: 'Заказы',
      value: formatNum(cur?.orders ?? 0),
      delta: cur && prev ? deltaPercent(cur.orders, prev.orders) : null,
      deltaLabel: 'к пред. периоду',
      unit: 'percent',
    },
    {
      label: 'Средний чек',
      value: formatRub(curAvg),
      delta: cur && prev ? deltaPercent(curAvg, prevAvg) : null,
      deltaLabel: 'к пред. периоду',
      unit: 'percent',
    },
    {
      label: 'Конверсия в оплату',
      value: formatPercent(curConv),
      delta: cur && prev ? curConv - prevConv : null,
      deltaLabel: 'к пред. периоду',
      unit: 'pp',
    },
  ];
}

function KpiCard({ label, value, delta, deltaLabel, unit }: Kpi) {
  const positive = delta !== null && delta > 0;
  const negative = delta !== null && delta < 0;

  const deltaText =
    delta === null
      ? '—'
      : unit === 'pp'
        ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)} п.п.`
        : formatSignedPercent(delta);

  return (
    <div className="panel px-5 py-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl text-ink tnum">{value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-sm">
        <span
          className={clsx(
            'inline-flex items-center gap-0.5 font-medium tnum',
            positive && 'text-positive',
            negative && 'text-negative',
            delta === null && 'text-muted',
          )}
        >
          {positive && '▲'}
          {negative && '▼'}
          {deltaText}
        </span>
        <span className="text-muted">{deltaLabel}</span>
      </div>
    </div>
  );
}
