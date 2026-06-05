// Доменные типы и формы ответов API. Используются и на сервере, и на клиенте.

export const ORDER_STATUSES = [
  'new',
  'processing',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CHANNELS = ['web', 'mobile', 'partner', 'offline', 'marketplace'] as const;
export type Channel = (typeof CHANNELS)[number];

export const SEGMENTS = ['SMB', 'Mid-Market', 'Enterprise', 'Startup'] as const;
export type Segment = (typeof SEGMENTS)[number];

export type Granularity = 'day' | 'week' | 'month';

export const SORTABLE_COLUMNS = ['created_at', 'amount', 'status', 'channel', 'id'] as const;
export type SortColumn = (typeof SORTABLE_COLUMNS)[number];
export type SortOrder = 'asc' | 'desc';

export interface OrderRow {
  id: number;
  customer_id: number;
  customer_name: string | null;
  segment: Segment | null;
  amount: number;
  status: OrderStatus;
  channel: Channel;
  created_at: string;
}

export interface Filters {
  from: string; // 'yyyy-mm-dd'
  to: string; // 'yyyy-mm-dd' (включительно)
  status: OrderStatus | null;
  channel: Channel | null;
  segment: Segment | null;
  granularity: Granularity;
  page: number;
  pageSize: number;
  sortBy: SortColumn;
  sortOrder: SortOrder;
}

export interface OrdersResponse {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RevenuePoint {
  bucket: string;
  revenue: number;
  orders: number;
}

export interface FunnelStage {
  stage: string;
  stage_order: number;
  reached: number;
}

export interface ChannelSlice {
  channel: Channel;
  revenue: number;
  orders: number;
}

export interface AnalyticsResponse {
  revenue: RevenuePoint[];
  funnel: FunnelStage[];
  channels: ChannelSlice[];
}

export interface PeriodMetrics {
  revenue: number;
  orders: number;
  conversions: number;
}

export interface ComparisonResponse {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  window: { from: string; to: string; prev_from: string; prev_to: string };
}

// --- Человекочитаемые подписи (RU) -----------------------------------------

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  processing: 'В обработке',
  paid: 'Оплачен',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
  refunded: 'Возврат',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  web: 'Сайт',
  mobile: 'Моб. приложение',
  partner: 'Партнёр',
  offline: 'Офлайн',
  marketplace: 'Маркетплейс',
};

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: 'По дням',
  week: 'По неделям',
  month: 'По месяцам',
};

// Цвета каналов (cohesive, без фиолетовых градиентов)
export const CHANNEL_COLORS: Record<Channel, string> = {
  web: '#1F3A5F',
  mobile: '#1C9AA8',
  partner: '#C08A2E',
  offline: '#B4543E',
  marketplace: '#5B667A',
};
