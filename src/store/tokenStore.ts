import { config } from '../config';
import { ShopAccount, StoreBackend } from './types';
import { FileStore } from './fileStore';

// Re-export the type so existing call sites keep importing it from here.
export type { ShopAccount } from './types';

let backend: StoreBackend | null = null;

/**
 * Resolve (once) the configured storage backend.
 *  - STORE_DRIVER=sqlite -> built-in node:sqlite database (Node 22.5+)
 *  - otherwise           -> JSON file store (default, works everywhere)
 *
 * The SQLite module is required lazily so the experimental `node:sqlite`
 * module is only loaded when actually selected.
 */
function getBackend(): StoreBackend {
  if (backend) return backend;

  if (config.storeDriver === 'sqlite') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SqliteStore } = require('./sqliteStore') as typeof import('./sqliteStore');
    backend = new SqliteStore(config.dbPath);
  } else {
    backend = new FileStore(config.dataDir);
  }
  return backend;
}

export function listAccounts(): ShopAccount[] {
  return getBackend().list();
}

export function getAccount(shopId: number): ShopAccount | undefined {
  return getBackend().get(shopId);
}

export function upsertAccount(account: ShopAccount): ShopAccount {
  return getBackend().upsert(account);
}

export function removeAccount(shopId: number): boolean {
  return getBackend().remove(shopId);
}
