import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export type StoreDriver = 'file' | 'sqlite';

export interface AppConfig {
  partnerId: number;
  partnerKey: string;
  host: string;
  redirectUrl: string;
  region: string;
  port: number;
  dataDir: string;
  storeDriver: StoreDriver;
  dbPath: string;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? 'data');
const storeDriver: StoreDriver =
  (process.env.STORE_DRIVER ?? 'file').toLowerCase() === 'sqlite' ? 'sqlite' : 'file';

export const config: AppConfig = {
  partnerId: num(process.env.SHOPEE_PARTNER_ID, 0),
  partnerKey: process.env.SHOPEE_PARTNER_KEY ?? '',
  host: (process.env.SHOPEE_HOST ?? 'https://partner.shopeemobile.com').replace(/\/+$/, ''),
  redirectUrl: process.env.SHOPEE_REDIRECT_URL ?? 'http://localhost:3000/auth/callback',
  region: process.env.SHOPEE_REGION ?? 'id',
  port: num(process.env.PORT, 3000),
  dataDir,
  storeDriver,
  // Absolute path to the SQLite database file (used when storeDriver=sqlite).
  dbPath: process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(dataDir, 'accounts.db'),
};

/**
 * Returns a human readable list of missing credentials so the UI/API can
 * tell the user exactly what to configure before connecting a shop.
 */
export function missingCredentials(): string[] {
  const missing: string[] = [];
  if (!config.partnerId) missing.push('SHOPEE_PARTNER_ID');
  if (!config.partnerKey) missing.push('SHOPEE_PARTNER_KEY');
  return missing;
}

export function isConfigured(): boolean {
  return missingCredentials().length === 0;
}
