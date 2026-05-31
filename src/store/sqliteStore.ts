import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ShopAccount, StoreBackend } from './types';

/** Shape of a row as stored in SQLite (snake_case, nullable optionals). */
interface AccountRow {
  shop_id: number;
  shop_name: string | null;
  region: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  connected_at: number;
  last_refreshed_at: number | null;
}

function rowToAccount(row: AccountRow): ShopAccount {
  return {
    shopId: row.shop_id,
    shopName: row.shop_name ?? undefined,
    region: row.region ?? undefined,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    connectedAt: row.connected_at,
    lastRefreshedAt: row.last_refreshed_at ?? undefined,
  };
}

/**
 * SQLite-backed token store using the built-in `node:sqlite` module
 * (Node.js 22.5+). No external dependency required.
 *
 * Enable with STORE_DRIVER=sqlite. The database file defaults to
 * `<DATA_DIR>/accounts.db`.
 */
export class SqliteStore implements StoreBackend {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        shop_id           INTEGER PRIMARY KEY,
        shop_name         TEXT,
        region            TEXT,
        access_token      TEXT NOT NULL,
        refresh_token     TEXT NOT NULL,
        expires_at        INTEGER NOT NULL,
        connected_at      INTEGER NOT NULL,
        last_refreshed_at INTEGER
      );
    `);
  }

  list(): ShopAccount[] {
    const rows = this.db
      .prepare('SELECT * FROM accounts ORDER BY connected_at ASC')
      .all() as unknown as AccountRow[];
    return rows.map(rowToAccount);
  }

  get(shopId: number): ShopAccount | undefined {
    const row = this.db
      .prepare('SELECT * FROM accounts WHERE shop_id = ?')
      .get(shopId) as unknown as AccountRow | undefined;
    return row ? rowToAccount(row) : undefined;
  }

  upsert(account: ShopAccount): ShopAccount {
    // connected_at is intentionally left out of the UPDATE clause so the
    // original first-connection time is preserved on conflict.
    this.db
      .prepare(
        `INSERT INTO accounts
           (shop_id, shop_name, region, access_token, refresh_token,
            expires_at, connected_at, last_refreshed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(shop_id) DO UPDATE SET
           shop_name         = excluded.shop_name,
           region            = excluded.region,
           access_token      = excluded.access_token,
           refresh_token     = excluded.refresh_token,
           expires_at        = excluded.expires_at,
           last_refreshed_at = excluded.last_refreshed_at`,
      )
      .run(
        account.shopId,
        account.shopName ?? null,
        account.region ?? null,
        account.accessToken,
        account.refreshToken,
        account.expiresAt,
        account.connectedAt,
        account.lastRefreshedAt ?? null,
      );
    // get() never returns undefined right after a successful upsert.
    return this.get(account.shopId) as ShopAccount;
  }

  remove(shopId: number): boolean {
    const info = this.db.prepare('DELETE FROM accounts WHERE shop_id = ?').run(shopId);
    return Number(info.changes) > 0;
  }
}
