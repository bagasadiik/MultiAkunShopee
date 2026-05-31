import { Router } from 'express';
import { getAccount } from '../store/tokenStore';
import {
  getAllOrders,
  getOrderDetail,
  getShopOrders,
  ordersToCsv,
  GetOrdersOptions,
  OrderStatus,
  TimeRangeField,
} from '../shopee/orders';
import { getTracking } from '../shopee/logistics';

export const ordersRouter = Router();

const VALID_STATUS: OrderStatus[] = [
  'UNPAID',
  'READY_TO_SHIP',
  'PROCESSED',
  'SHIPPED',
  'COMPLETED',
  'IN_CANCEL',
  'CANCELLED',
  'INVOICE_PENDING',
];

function parseOptions(query: Record<string, unknown>): GetOrdersOptions {
  const days = Number(query.days);
  const statusRaw = typeof query.status === 'string' ? query.status.toUpperCase() : undefined;
  const status = VALID_STATUS.includes(statusRaw as OrderStatus)
    ? (statusRaw as OrderStatus)
    : undefined;
  const trf = query.time_range_field;
  const timeRangeField: TimeRangeField =
    trf === 'update_time' ? 'update_time' : 'create_time';
  const maxOrders = Number(query.max);

  return {
    days: Number.isFinite(days) ? days : undefined,
    status,
    timeRangeField,
    maxOrders: Number.isFinite(maxOrders) ? maxOrders : undefined,
  };
}

/**
 * GET /api/orders — aggregated orders across all connected shops.
 * Query: days (<=15), status, time_range_field (create_time|update_time), max
 */
ordersRouter.get('/', async (req, res) => {
  try {
    const result = await getAllOrders(parseOptions(req.query as Record<string, unknown>));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'orders_failed', message });
  }
});

function sendCsv(res: import('express').Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/orders/export.csv — download aggregated orders (all shops) as CSV.
 * Same query filters as GET /api/orders.
 */
ordersRouter.get('/export.csv', async (req, res) => {
  try {
    const { orders } = await getAllOrders(parseOptions(req.query as Record<string, unknown>));
    sendCsv(res, `pesanan-semua-toko-${stamp()}.csv`, ordersToCsv(orders));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'export_failed', message });
  }
});

/**
 * Handler: download a single shop's orders as CSV.
 * Mounted at GET /api/shops/:shopId/orders/export.csv.
 */
export const shopOrdersCsvHandler: import('express').RequestHandler = async (req, res) => {
  const shopId = Number(req.params.shopId);
  if (!Number.isFinite(shopId) || !getAccount(shopId)) {
    res.status(404).json({ error: 'not_found', message: 'Toko tidak ditemukan.' });
    return;
  }
  try {
    const orders = await getShopOrders(
      shopId,
      parseOptions(req.query as Record<string, unknown>),
    );
    sendCsv(res, `pesanan-toko-${shopId}-${stamp()}.csv`, ordersToCsv(orders));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'export_failed', message });
  }
};

/**
 * Handler: full detail for one order + best-effort delivery tracking.
 * Mounted at GET /api/shops/:shopId/orders/:orderSn.
 */
export const orderDetailHandler: import('express').RequestHandler = async (req, res) => {
  const shopId = Number(req.params.shopId);
  const orderSn = String(req.params.orderSn);
  if (!Number.isFinite(shopId) || !getAccount(shopId)) {
    res.status(404).json({ error: 'not_found', message: 'Toko tidak ditemukan.' });
    return;
  }
  try {
    const order = await getOrderDetail(shopId, orderSn);
    if (!order) {
      res.status(404).json({ error: 'not_found', message: 'Pesanan tidak ditemukan.' });
      return;
    }
    const tracking = await getTracking(shopId, orderSn);
    res.json({ order, tracking });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'detail_failed', message });
  }
};

/**
 * Express handler for orders of a single shop. Exported so it can be mounted
 * on the shops router at GET /api/shops/:shopId/orders.
 */
export const shopOrdersHandler: import('express').RequestHandler = async (req, res) => {
  const shopId = Number(req.params.shopId);
  if (!Number.isFinite(shopId) || !getAccount(shopId)) {
    res.status(404).json({ error: 'not_found', message: 'Toko tidak ditemukan.' });
    return;
  }
  try {
    const orders = await getShopOrders(
      shopId,
      parseOptions(req.query as Record<string, unknown>),
    );
    res.json({ orders, errors: [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'orders_failed', message });
  }
};
