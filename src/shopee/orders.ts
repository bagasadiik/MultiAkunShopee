import { callShop } from './client';
import { getValidAccount } from './auth';
import { getAccount, listAccounts } from '../store/tokenStore';

const ORDER_LIST_PATH = '/api/v2/order/get_order_list';
const ORDER_DETAIL_PATH = '/api/v2/order/get_order_detail';

/** Max time window Shopee accepts for a single order list query. */
const MAX_WINDOW_DAYS = 15;
const DETAIL_BATCH = 50; // get_order_detail accepts up to 50 order_sn per call.

export type OrderStatus =
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'PROCESSED'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'IN_CANCEL'
  | 'CANCELLED'
  | 'INVOICE_PENDING';

export type TimeRangeField = 'create_time' | 'update_time';

interface OrderListResponse {
  order_list: Array<{ order_sn: string; order_status?: string }>;
  more: boolean;
  next_cursor: string;
}

interface OrderDetailResponse {
  order_list: ShopeeOrderDetail[];
}

/** Subset of order detail fields we surface in the dashboard. */
export interface ShopeeOrderDetail {
  order_sn: string;
  order_status?: string;
  create_time?: number;
  update_time?: number;
  currency?: string;
  total_amount?: number;
  buyer_username?: string;
  payment_method?: string;
  shipping_carrier?: string;
  cod?: boolean;
  message_to_seller?: string;
  item_list?: Array<{
    item_name?: string;
    model_name?: string;
    model_quantity_purchased?: number;
    model_discounted_price?: number;
    image_info?: { image_url?: string };
  }>;
  recipient_address?: {
    name?: string;
    city?: string;
    state?: string;
    region?: string;
  };
}

/** A normalized order enriched with which shop it belongs to. */
export interface DashboardOrder extends ShopeeOrderDetail {
  shopId: number;
  shopName?: string;
}

const DETAIL_FIELDS = [
  'order_status',
  'total_amount',
  'currency',
  'create_time',
  'update_time',
  'buyer_username',
  'payment_method',
  'shipping_carrier',
  'cod',
  'message_to_seller',
  'item_list',
  'recipient_address',
].join(',');

function clampWindowDays(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return MAX_WINDOW_DAYS;
  return Math.min(Math.floor(days), MAX_WINDOW_DAYS);
}

export interface GetOrdersOptions {
  days?: number;
  status?: OrderStatus;
  timeRangeField?: TimeRangeField;
  /** Safety cap on how many orders to pull per shop. */
  maxOrders?: number;
}

/**
 * Fetch all order serial numbers for a shop within a time window, following
 * Shopee's cursor pagination.
 */
async function fetchOrderSns(
  shopId: number,
  opts: Required<Pick<GetOrdersOptions, 'days' | 'timeRangeField' | 'maxOrders'>> & {
    status?: OrderStatus;
  },
): Promise<string[]> {
  const account = await getValidAccount(shopId);
  const now = Math.floor(Date.now() / 1000);
  const timeFrom = now - opts.days * 24 * 60 * 60;

  const sns: string[] = [];
  let cursor = '';
  let more = true;

  while (more && sns.length < opts.maxOrders) {
    const body = await callShop<OrderListResponse>(ORDER_LIST_PATH, {
      accessToken: account.accessToken,
      shopId,
      query: {
        time_range_field: opts.timeRangeField,
        time_from: timeFrom,
        time_to: now,
        page_size: 100,
        cursor: cursor || undefined,
        order_status: opts.status,
        response_optional_fields: 'order_status',
      },
    });

    const resp = body.response;
    if (!resp) break;
    for (const o of resp.order_list ?? []) sns.push(o.order_sn);
    more = Boolean(resp.more);
    cursor = resp.next_cursor ?? '';
    if (!cursor) break;
  }

  return sns.slice(0, opts.maxOrders);
}

/** Fetch detailed orders for a list of order serial numbers, batched by 50. */
async function fetchOrderDetails(
  shopId: number,
  orderSns: string[],
): Promise<ShopeeOrderDetail[]> {
  if (orderSns.length === 0) return [];
  const account = await getValidAccount(shopId);
  const details: ShopeeOrderDetail[] = [];

  for (let i = 0; i < orderSns.length; i += DETAIL_BATCH) {
    const batch = orderSns.slice(i, i + DETAIL_BATCH);
    const body = await callShop<OrderDetailResponse>(ORDER_DETAIL_PATH, {
      accessToken: account.accessToken,
      shopId,
      query: {
        order_sn_list: batch.join(','),
        response_optional_fields: DETAIL_FIELDS,
      },
    });
    for (const order of body.response?.order_list ?? []) details.push(order);
  }

  return details;
}

/** Get enriched orders for a single shop. */
export async function getShopOrders(
  shopId: number,
  options: GetOrdersOptions = {},
): Promise<DashboardOrder[]> {
  const opts = {
    days: clampWindowDays(options.days ?? MAX_WINDOW_DAYS),
    timeRangeField: options.timeRangeField ?? 'create_time',
    maxOrders: options.maxOrders ?? 200,
    status: options.status,
  };

  const account = getAccount(shopId);
  const sns = await fetchOrderSns(shopId, opts);
  const details = await fetchOrderDetails(shopId, sns);

  return details
    .map((d) => ({ ...d, shopId, shopName: account?.shopName }))
    .sort((a, b) => (b.create_time ?? 0) - (a.create_time ?? 0));
}

export interface AggregatedOrders {
  orders: DashboardOrder[];
  errors: Array<{ shopId: number; shopName?: string; error: string }>;
}

/**
 * Get orders across every connected account, merged and sorted by newest.
 * Failures on individual shops are collected instead of failing the whole call.
 */
export async function getAllOrders(options: GetOrdersOptions = {}): Promise<AggregatedOrders> {
  const accounts = listAccounts();
  const results = await Promise.allSettled(
    accounts.map((a) => getShopOrders(a.shopId, options)),
  );

  const orders: DashboardOrder[] = [];
  const errors: AggregatedOrders['errors'] = [];

  results.forEach((res, idx) => {
    const acc = accounts[idx];
    if (res.status === 'fulfilled') {
      orders.push(...res.value);
    } else {
      errors.push({
        shopId: acc.shopId,
        shopName: acc.shopName,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  });

  orders.sort((a, b) => (b.create_time ?? 0) - (a.create_time ?? 0));
  return { orders, errors };
}
