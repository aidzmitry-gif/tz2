'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { AnalyticsResponse, ComparisonResponse, OrdersResponse } from '@/lib/types';

/** Дебаунс значения — чтобы не спамить запросами при вводе дат. */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Ошибка запроса (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

// keepPreviousData: данные не "мигают" при смене фильтров — старое значение
// остаётся на экране, пока грузится новое.
const swrOptions = {
  keepPreviousData: true,
  revalidateOnFocus: false,
  dedupingInterval: 10_000,
} as const;

export function useOrders(query: string) {
  return useSWR<OrdersResponse>(`/api/orders?${query}`, fetcher, swrOptions);
}

export function useAnalytics(query: string) {
  return useSWR<AnalyticsResponse>(`/api/analytics?${query}`, fetcher, swrOptions);
}

export function useComparison(query: string) {
  return useSWR<ComparisonResponse>(`/api/comparison?${query}`, fetcher, swrOptions);
}
