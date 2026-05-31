import crypto from 'node:crypto';
import { config } from '../config';

/**
 * Low level Shopee Open API v2 client.
 *
 * Signing rules (HMAC-SHA256, hex, secret = partner_key):
 *   - Public  APIs : base = partner_id + api_path + timestamp
 *   - Shop    APIs : base = partner_id + api_path + timestamp + access_token + shop_id
 *
 * Common query params on every request: partner_id, timestamp, sign.
 * Shop level requests additionally carry access_token & shop_id.
 */

export class ShopeeApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly httpStatus?: number,
  ) {
    super(message || code);
    this.name = 'ShopeeApiError';
  }
}

/** Shopee envelope returned by virtually every v2 endpoint. */
export interface ShopeeEnvelope<T = unknown> {
  error?: string;
  message?: string;
  request_id?: string;
  response?: T;
  warning?: string;
  // refresh/token endpoints put fields at the top level alongside error/message
  [key: string]: unknown;
}

export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function hmac(baseString: string): string {
  return crypto.createHmac('sha256', config.partnerKey).update(baseString).digest('hex');
}

export function signPublic(apiPath: string, timestamp: number): string {
  return hmac(`${config.partnerId}${apiPath}${timestamp}`);
}

export function signShop(
  apiPath: string,
  timestamp: number,
  accessToken: string,
  shopId: number,
): string {
  return hmac(`${config.partnerId}${apiPath}${timestamp}${accessToken}${shopId}`);
}

type QueryValue = string | number | boolean | undefined | null;

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
}

async function parseResponse<T>(res: Response): Promise<ShopeeEnvelope<T>> {
  const text = await res.text();
  let body: ShopeeEnvelope<T>;
  try {
    body = text ? (JSON.parse(text) as ShopeeEnvelope<T>) : {};
  } catch {
    throw new ShopeeApiError(
      'invalid_response',
      `Respons non-JSON dari Shopee (HTTP ${res.status}): ${text.slice(0, 300)}`,
      undefined,
      res.status,
    );
  }

  // Shopee signals failures with a non-empty `error` string.
  if (body.error) {
    throw new ShopeeApiError(
      body.error,
      body.message || `Shopee error: ${body.error}`,
      body.request_id,
      res.status,
    );
  }

  if (!res.ok) {
    throw new ShopeeApiError('http_error', `HTTP ${res.status}`, body.request_id, res.status);
  }

  return body;
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function doFetch(url: URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ShopeeApiError('timeout', `Permintaan ke Shopee timeout (${DEFAULT_TIMEOUT_MS}ms)`);
    }
    throw new ShopeeApiError(
      'network_error',
      `Gagal menghubungi Shopee: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call a PUBLIC endpoint (no shop context), e.g. token get/refresh.
 * These are always POST with a JSON body in the Shopee API.
 */
export async function callPublic<T = unknown>(
  apiPath: string,
  body: Record<string, unknown>,
): Promise<ShopeeEnvelope<T>> {
  const timestamp = unixNow();
  const sign = signPublic(apiPath, timestamp);
  const url = new URL(config.host + apiPath);
  appendQuery(url, { partner_id: config.partnerId, timestamp, sign });

  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export interface ShopCallOptions {
  accessToken: string;
  shopId: number;
  method?: 'GET' | 'POST';
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
}

/**
 * Call a SHOP-level endpoint (requires a valid access_token bound to a shop_id).
 */
export async function callShop<T = unknown>(
  apiPath: string,
  opts: ShopCallOptions,
): Promise<ShopeeEnvelope<T>> {
  const timestamp = unixNow();
  const sign = signShop(apiPath, timestamp, opts.accessToken, opts.shopId);
  const url = new URL(config.host + apiPath);
  appendQuery(url, {
    partner_id: config.partnerId,
    timestamp,
    access_token: opts.accessToken,
    shop_id: opts.shopId,
    sign,
  });
  appendQuery(url, opts.query);

  const method = opts.method ?? 'GET';
  const init: RequestInit = { method };
  if (method === 'POST') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.body ?? {});
  }

  const res = await doFetch(url, init);
  return parseResponse<T>(res);
}
