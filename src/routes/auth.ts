import { Router } from 'express';
import { isConfigured } from '../config';
import { buildAuthUrl, exchangeCodeForToken } from '../shopee/auth';
import { getShopInfo } from '../shopee/shop';

export const authRouter = Router();

/**
 * Kick off the OAuth flow: redirect the user to Shopee's authorization page.
 * After they approve, Shopee redirects back to /auth/callback.
 */
authRouter.get('/login', (_req, res) => {
  if (!isConfigured()) {
    res.status(400).send(
      'Aplikasi belum dikonfigurasi. Set SHOPEE_PARTNER_ID dan SHOPEE_PARTNER_KEY di file .env.',
    );
    return;
  }
  res.redirect(buildAuthUrl());
});

/**
 * OAuth callback. Shopee appends `code` and `shop_id` to the redirect URL.
 * We exchange the code for tokens, persist the account, then send the user
 * back to the dashboard.
 */
authRouter.get('/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const shopIdRaw = req.query.shop_id;
  const shopId = Number(Array.isArray(shopIdRaw) ? shopIdRaw[0] : shopIdRaw);

  if (!code || !Number.isFinite(shopId) || shopId <= 0) {
    res
      .status(400)
      .send('Callback tidak valid: parameter "code" atau "shop_id" tidak ada.');
    return;
  }

  try {
    await exchangeCodeForToken(code, shopId);
    // Best-effort: resolve & cache the shop name. Don't fail the flow if it errors.
    try {
      await getShopInfo(shopId);
    } catch {
      /* ignore — name will resolve on next refresh */
    }
    res.redirect(`/?connected=${shopId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).send(`Gagal menukar kode otorisasi: ${message}`);
  }
});
