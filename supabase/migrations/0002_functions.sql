-- ============================================================================
-- Миграция 0002 — RPC-функции для тяжёлых агрегатов
-- Вся агрегация выполняется в БД (date_trunc / group by), на клиент уходят
-- только сжатые результаты.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Выручка по периодам (день / неделя / месяц)
-- ----------------------------------------------------------------------------
create or replace function public.revenue_by_period(
  p_from        timestamptz,
  p_to          timestamptz,
  p_granularity text default 'day',     -- 'day' | 'week' | 'month'
  p_status      text default null,
  p_channel     text default null,
  p_segment     text default null
)
returns table (
  bucket  timestamptz,
  revenue numeric,
  orders  bigint
)
language sql
stable
as $$
  select
    date_trunc(
      case when p_granularity in ('day', 'week', 'month') then p_granularity else 'day' end,
      o.created_at
    ) as bucket,
    sum(o.amount) as revenue,
    count(*)      as orders
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.created_at >= p_from
    and o.created_at <  p_to
    and (p_status  is null or o.status  = p_status)
    and (p_channel is null or o.channel = p_channel)
    and (p_segment is null or c.segment = p_segment)
  group by 1
  order by 1;
$$;

-- ----------------------------------------------------------------------------
-- Воронка конверсии по статусам.
-- "reached" = число заказов, дошедших ДО этой стадии и дальше
-- (накопительно: delivered считается во всех предыдущих стадиях).
-- cancelled / refunded в воронку не входят.
-- ----------------------------------------------------------------------------
create or replace function public.conversion_funnel(
  p_from    timestamptz,
  p_to      timestamptz,
  p_channel text default null,
  p_segment text default null
)
returns table (
  stage       text,
  stage_order int,
  reached     bigint
)
language sql
stable
as $$
  with ranked as (
    select
      case o.status
        when 'new'        then 1
        when 'processing' then 2
        when 'paid'       then 3
        when 'shipped'    then 4
        when 'delivered'  then 5
        else 0  -- cancelled / refunded
      end as rnk
    from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.created_at >= p_from
      and o.created_at <  p_to
      and (p_channel is null or o.channel = p_channel)
      and (p_segment is null or c.segment = p_segment)
  )
  select
    s.stage,
    s.stage_order,
    (select count(*) from ranked r where r.rnk >= s.stage_order) as reached
  from (values
    ('new', 1),
    ('processing', 2),
    ('paid', 3),
    ('shipped', 4),
    ('delivered', 5)
  ) as s(stage, stage_order)
  order by s.stage_order;
$$;

-- ----------------------------------------------------------------------------
-- Распределение по каналам
-- ----------------------------------------------------------------------------
create or replace function public.channel_distribution(
  p_from    timestamptz,
  p_to      timestamptz,
  p_status  text default null,
  p_segment text default null
)
returns table (
  channel text,
  revenue numeric,
  orders  bigint
)
language sql
stable
as $$
  select
    o.channel,
    sum(o.amount) as revenue,
    count(*)      as orders
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.created_at >= p_from
    and o.created_at <  p_to
    and (p_status  is null or o.status  = p_status)
    and (p_segment is null or c.segment = p_segment)
  group by o.channel
  order by revenue desc;
$$;

-- ----------------------------------------------------------------------------
-- Сравнение периодов: "текущий vs предыдущий" равной длины.
-- Предыдущий период = [p_from - (p_to - p_from), p_from).
-- Возвращает JSON: { current, previous, window }.
-- "conversions" = заказы, дошедшие минимум до 'paid'.
-- ----------------------------------------------------------------------------
create or replace function public.period_comparison(
  p_from    timestamptz,
  p_to      timestamptz,
  p_status  text default null,
  p_channel text default null,
  p_segment text default null
)
returns json
language sql
stable
as $$
  with bounds as (
    select
      p_from                       as cur_from,
      p_to                         as cur_to,
      p_from - (p_to - p_from)     as prev_from,
      p_from                       as prev_to
  ),
  agg as (
    select
      'current' as period,
      coalesce(sum(o.amount), 0)                                                as revenue,
      count(*)                                                                  as orders,
      count(*) filter (where o.status in ('paid', 'shipped', 'delivered'))      as conversions
    from public.orders o
    join public.customers c on c.id = o.customer_id
    cross join bounds b
    where o.created_at >= b.cur_from
      and o.created_at <  b.cur_to
      and (p_status  is null or o.status  = p_status)
      and (p_channel is null or o.channel = p_channel)
      and (p_segment is null or c.segment = p_segment)
    union all
    select
      'previous',
      coalesce(sum(o.amount), 0),
      count(*),
      count(*) filter (where o.status in ('paid', 'shipped', 'delivered'))
    from public.orders o
    join public.customers c on c.id = o.customer_id
    cross join bounds b
    where o.created_at >= b.prev_from
      and o.created_at <  b.prev_to
      and (p_status  is null or o.status  = p_status)
      and (p_channel is null or o.channel = p_channel)
      and (p_segment is null or c.segment = p_segment)
  )
  select json_build_object(
    'current',  (select row_to_json(x) from (select revenue, orders, conversions from agg where period = 'current')  x),
    'previous', (select row_to_json(x) from (select revenue, orders, conversions from agg where period = 'previous') x),
    'window',   (select json_build_object(
                   'from',      cur_from,
                   'to',        cur_to,
                   'prev_from', prev_from,
                   'prev_to',   prev_to
                 ) from bounds)
  );
$$;

-- ----------------------------------------------------------------------------
-- Права на выполнение для anon/authenticated (функции — security invoker,
-- читают таблицы через RLS-политики SELECT выше).
-- ----------------------------------------------------------------------------
grant execute on function public.revenue_by_period(timestamptz, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public.conversion_funnel(timestamptz, timestamptz, text, text)            to anon, authenticated;
grant execute on function public.channel_distribution(timestamptz, timestamptz, text, text)          to anon, authenticated;
grant execute on function public.period_comparison(timestamptz, timestamptz, text, text, text)       to anon, authenticated;
