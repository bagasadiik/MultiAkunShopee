import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  partnerId: number;
  partnerKey: string;
  host: string;
  redirectUrl: string;
  region: string;
  port: number;
  dataDir: string;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config: AppConfig = {
  partnerId: num(process.env.SHOPEE_PARTNER_ID, 0),
  partnerKey: process.env.SHOPEE_PARTNER_KEY ?? '',
  host: (process.env.SHOPEE_HOST ?? 'https://partner.shopeemobile.com').replace(/\/+$/, ''),
  redirectUrl: process.env.SHOPEE_REDIRECT_URL ?? 'http://localhost:3000/auth/callback',
  region: process.env.SHOPEE_REGION ?? 'id',
  port: num(process.env.PORT, 3000),
  dataDir: path.resolve(process.cwd(), process.env.DATA_DIR ?? 'data'),
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
