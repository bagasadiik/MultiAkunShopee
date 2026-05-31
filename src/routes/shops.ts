import { Router } from 'express';
import { listAccounts, getAccount, removeAccount } from '../store/tokenStore';
import { isExpired, refreshAccessToken } from '../shopee/auth';
import { getShopInfo } from '../shopee/shop';
import { shopOrdersHandler, shopOrdersCsvHandler, orderDetailHandler } from './orders';

export const shopsRouter = Router();

// NOTE: order matters — the literal "export.csv" route must be registered
// before the "/:orderSn" param route so it isn't captured as an order number.
/** GET /api/shops/:shopId/orders/export.csv — download this shop's orders as CSV. */
shopsRouter.get('/:shopId/orders/export.csv', shopOrdersCsvHandler);
/** GET /api/shops/:shopId/orders/:orderSn — single order detail + tracking. */
shopsRouter.get('/:shopId/orders/:orderSn', orderDetailHandler);
/** GET /api/shops/:shopId/orders — orders for a single shop. */
shopsRouter.get('/:shopId/orders', shopOrdersHandler);

function parseShopId(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Public-safe view of an account (never expose tokens to the browser). */
function toPublic(shopId: number) {
  const a = getAccount(shopId);
  if (!a) return null;
  return {
    shopId: a.shopId,
    shopName: a.shopName ?? null,
    region: a.region ?? null,
    connectedAt: a.connectedAt,
    expiresAt: a.expiresAt,
    lastRefreshedAt: a.lastRefreshedAt ?? null,
    expired: isExpired(a),
  };
}

/** GET /api/shops — list all connected accounts (no tokens). */
shopsRouter.get('/', (_req, res) => {
  const shops = listAccounts().map((a) => toPublic(a.shopId)).filter(Boolean);
  res.json({ shops });
});

/** GET /api/shops/:shopId — single account info, refreshing the profile. */
shopsRouter.get('/:shopId', async (req, res) => {
  const shopId = parseShopId(req.params.shopId);
  if (Number.isNaN(shopId) || !getAccount(shopId)) {
    res.status(404).json({ error: 'not_found', message: 'Toko tidak ditemukan.' });
    return;
  }
  try {
    await getShopInfo(shopId);
  } catch {
    /* ignore profile refresh errors */
  }
  res.json({ shop: toPublic(shopId) });
});

/** POST /api/shops/:shopId/refresh — manually refresh the access token. */
shopsRouter.post('/:shopId/refresh', async (req, res) => {
  const shopId = parseShopId(req.params.shopId);
  if (Number.isNaN(shopId) || !getAccount(shopId)) {
    res.status(404).json({ error: 'not_found', message: 'Toko tidak ditemukan.' });
    return;
  }
  try {
    await refreshAccessToken(shopId);
    res.json({ shop: toPublic(shopId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'refresh_failed', message });
  }
});

/** DELETE /api/shops/:shopId — disconnect an account (local only). */
shopsRouter.delete('/:shopId', (req, res) => {
  const shopId = parseShopId(req.params.shopId);
  if (Number.isNaN(shopId)) {
    res.status(400).json({ error: 'bad_request', message: 'shopId tidak valid.' });
    return;
  }
  const removed = removeAccount(shopId);
  res.json({ removed });
});
