import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

/**
 * One connected Shopee shop/account. Tokens are stored on disk so the
 * dashboard can manage several shops at once across restarts.
 *
 * SECURITY: this file contains access & refresh tokens. The `data/` folder
 * is git-ignored. In production prefer an encrypted secret store / DB.
 */
export interface ShopAccount {
  shopId: number;
  shopName?: string;
  region?: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  /** Epoch milliseconds when this account was first connected. */
  connectedAt: number;
  /** Epoch milliseconds of the last successful token refresh. */
  lastRefreshedAt?: number;
}

interface StoreShape {
  shops: Record<string, ShopAccount>;
}

const FILE = path.join(config.dataDir, 'accounts.json');

function ensureDir(): void {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function read(): StoreShape {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed.shops) return { shops: {} };
    return parsed;
  } catch {
    return { shops: {} };
  }
}

function write(data: StoreShape): void {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function listAccounts(): ShopAccount[] {
  return Object.values(read().shops).sort((a, b) => a.connectedAt - b.connectedAt);
}

export function getAccount(shopId: number): ShopAccount | undefined {
  return read().shops[String(shopId)];
}

export function upsertAccount(account: ShopAccount): ShopAccount {
  const data = read();
  const existing = data.shops[String(account.shopId)];
  data.shops[String(account.shopId)] = {
    ...existing,
    ...account,
    connectedAt: existing?.connectedAt ?? account.connectedAt,
  };
  write(data);
  return data.shops[String(account.shopId)];
}

export function removeAccount(shopId: number): boolean {
  const data = read();
  if (!data.shops[String(shopId)]) return false;
  delete data.shops[String(shopId)];
  write(data);
  return true;
}
