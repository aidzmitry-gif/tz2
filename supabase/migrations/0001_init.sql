-- ============================================================================
-- Миграция 0001 — схема данных дашборда аналитики продаж
-- ============================================================================

-- Удаляем при повторном применении (удобно для пере-инициализации в деве)
drop table if exists public.orders cascade;
drop table if exists public.customers cascade;

-- ----------------------------------------------------------------------------
-- Клиенты
-- ----------------------------------------------------------------------------
create table public.customers (
  id          bigint generated always as identity primary key,
  name        text not null,
  segment     text not null check (segment in ('SMB', 'Mid-Market', 'Enterprise', 'Startup')),
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Заказы
-- ----------------------------------------------------------------------------
create table public.orders (
  id           bigint generated always as identity primary key,
  customer_id  bigint not null references public.customers (id) on delete cascade,
  amount       numeric(12, 2) not null check (amount >= 0),
  status       text not null check (status in ('new', 'processing', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  channel      text not null check (channel in ('web', 'mobile', 'partner', 'offline', 'marketplace')),
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Индексы под фильтры/сортировки/агрегаты
-- ----------------------------------------------------------------------------
create index orders_created_at_idx   on public.orders (created_at desc);
create index orders_status_idx       on public.orders (status);
create index orders_channel_idx      on public.orders (channel);
create index orders_customer_id_idx  on public.orders (customer_id);
-- Композитный индекс ускоряет "период + сортировка по сумме"
create index orders_created_amount_idx on public.orders (created_at desc, amount desc);
create index customers_segment_idx    on public.customers (segment);

-- ----------------------------------------------------------------------------
-- RLS: дашборд только читает данные. Включаем RLS и даём публичный SELECT,
-- чтобы приложение работало с anon-ключом из коробки.
-- (Запись делается миграциями/сидом под сервисной ролью в обход RLS.)
-- ----------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.orders    enable row level security;

create policy "public read customers" on public.customers for select using (true);
create policy "public read orders"    on public.orders    for select using (true);
