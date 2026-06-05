import { Suspense } from 'react';
import Dashboard from '@/components/Dashboard';

export default function Page() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Аналитика продаж
        </h1>
        <p className="mt-1.5 max-w-2xl text-muted">
          Графики выручки, воронка конверсии и распределение по каналам. Фильтры синхронизируются
          со ссылкой, тяжёлые агрегаты считаются в БД и кэшируются.
        </p>
      </header>

      <Suspense
        fallback={<div className="panel px-5 py-16 text-center text-muted">Загрузка дашборда…</div>}
      >
        <Dashboard />
      </Suspense>
    </main>
  );
}
