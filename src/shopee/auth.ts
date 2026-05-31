import { config } from '../config';
import { callPublic, signPublic, unixNow } from './client';
import {
  getAccount,
  ShopAccount,
  upsertAccount,
} from '../store/tokenStore';

const AUTH_PATH = '/api/v2/shop/auth_partner';
const TOKEN_GET_PATH = '/api/v2/auth/token/get';
const TOKEN_REFRESH_PATH = '/api/v2/auth/access_token/get';

/** Refresh a little before the real expiry to avoid edge-of-expiry failures. */
const REFRESH_SKEW_MS = 5 * 60 * 1000; // 5 minutes

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  /** Seconds until the access token expires (~14400 = 4 hours). */
  expire_in: number;
  shop_id_list?: number[];
  merchant_id_list?: number[];
}

/**
 * Build the Shopee authorization URL. Sending the user here lets them log in
 * to a Shopee account they own and grant this app access to a shop.
 * The link is short-lived, so generate it fresh per click.
 */
export function buildAuthUrl(): string {
  const timestamp = unixNow();
  const sign = signPublic(AUTH_PATH, timestamp);
  const url = new URL(config.host + AUTH_PATH);
  url.searchParams.set('partner_id', String(config.partnerId));
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);
  url.searchParams.set('redirect', config.redirectUrl);
  return url.toString();
}

function expiresAtFrom(expireInSeconds: number): number {
  return Date.now() + expireInSeconds * 1000;
}

/**
 * Exchange the one-time `code` (from the redirect) for access/refresh tokens
 * and persist the account.
 */
export async function exchangeCodeForToken(
  code: string,
  shopId: number,
): Promise<ShopAccount> {
  const body = await callPublic<unknown>(TOKEN_GET_PATH, {
    code,
    shop_id: shopId,
    partner_id: config.partnerId,
  });

  const token = body as unknown as TokenResponse;
  if (!token.access_token || !token.refresh_token) {
    throw new Error('Respons token tidak lengkap dari Shopee.');
  }

  const account: ShopAccount = {
    shopId,
    region: config.region,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: expiresAtFrom(token.expire_in),
    connectedAt: Date.now(),
    lastRefreshedAt: Date.now(),
  };
  return upsertAccount(account);
}

/**
 * Refresh the access token for a shop using its refresh token, and persist.
 */
export async function refreshAccessToken(shopId: number): Promise<ShopAccount> {
  const account = getAccount(shopId);
  if (!account) {
    throw new Error(`Akun toko ${shopId} belum terhubung.`);
  }

  const body = await callPublic<unknown>(TOKEN_REFRESH_PATH, {
    refresh_token: account.refreshToken,
    shop_id: shopId,
    partner_id: config.partnerId,
  });

  const token = body as unknown as TokenResponse;
  if (!token.access_token) {
    throw new Error('Gagal memperbarui token: access_token kosong.');
  }

  return upsertAccount({
    ...account,
    accessToken: token.access_token,
    // Shopee may rotate the refresh token; keep the old one if not returned.
    refreshToken: token.refresh_token || account.refreshToken,
    expiresAt: expiresAtFrom(token.expire_in),
    lastRefreshedAt: Date.now(),
  });
}

/**
 * Return a valid access token for a shop, refreshing transparently if the
 * current one is expired (or about to expire).
 */
export async function getValidAccount(shopId: number): Promise<ShopAccount> {
  const account = getAccount(shopId);
  if (!account) {
    throw new Error(`Akun toko ${shopId} belum terhubung.`);
  }
  if (Date.now() < account.expiresAt - REFRESH_SKEW_MS) {
    return account;
  }
  return refreshAccessToken(shopId);
}

export function isExpired(account: ShopAccount): boolean {
  return Date.now() >= account.expiresAt - REFRESH_SKEW_MS;
}
