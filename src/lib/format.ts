import { Granularity } from './types';

const rubFmt = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const rubCompactFmt = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const numFmt = new Intl.NumberFormat('ru-RU');

export function formatRub(value: number): string {
  return rubFmt.format(Number.isFinite(value) ? value : 0);
}

export function formatRubCompact(value: number): string {
  return rubCompactFmt.format(Number.isFinite(value) ? value : 0);
}

export function formatNum(value: number): string {
  return numFmt.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** Относительное изменение в % (cur vs prev). */
export function deltaPercent(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

const dtFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const dFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });

export function formatDateTime(iso: string): string {
  return dtFmt.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dFmt.format(new Date(iso));
}

/** Подпись точки на оси X в зависимости от гранулярности. */
export function formatBucket(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === 'month') {
    return d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
  }
  if (granularity === 'week') {
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
