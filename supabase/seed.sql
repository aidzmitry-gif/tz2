-- ============================================================================
-- Сид: 600 клиентов + 12 000 заказов за последние ~365 дней.
-- Всё генерируется на стороне БД через generate_series — выполняется мгновенно.
-- Запуск:  psql "$DATABASE_URL" -f supabase/seed.sql
--   или    через Supabase Dashboard → SQL Editor (вставить и Run)
--   или    supabase db reset  (если используете Supabase CLI — сид подхватится)
-- ============================================================================

truncate table public.orders restart identity cascade;
truncate table public.customers restart identity cascade;

-- ---- Клиенты ---------------------------------------------------------------
insert into public.customers (name, segment, created_at)
select
  'Клиент №' || g,
  (array['SMB', 'Mid-Market', 'Enterprise', 'Startup'])[1 + floor(random() * 4)::int],
  now() - (random() * 540 || ' days')::interval
from generate_series(1, 600) as g;

-- ---- Заказы ----------------------------------------------------------------
-- Сумма зависит от случайности; равномерное распределение статусов даёт
-- естественно убывающую воронку (new..delivered = 5 из 7 статусов).
insert into public.orders (customer_id, amount, status, channel, created_at)
select
  1 + floor(random() * 600)::int,
  round((random() * 49000 + 1000)::numeric, 2),                       -- 1 000 .. 50 000 ₽
  (array['new', 'processing', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'])[1 + floor(random() * 7)::int],
  (array['web', 'mobile', 'partner', 'offline', 'marketplace'])[1 + floor(random() * 5)::int],
  now() - (random() * 365 || ' days')::interval                       -- последние 365 дней
from generate_series(1, 12000) as g;

-- Контрольная проверка
do $$
declare
  c_count bigint;
  o_count bigint;
begin
  select count(*) into c_count from public.customers;
  select count(*) into o_count from public.orders;
  raise notice 'Готово: % клиентов, % заказов', c_count, o_count;
end $$;
