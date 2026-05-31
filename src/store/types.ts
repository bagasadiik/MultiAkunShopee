/**
 * One connected Shopee shop/account. Tokens are persisted so the dashboard
 * can manage several shops at once across restarts.
 *
 * SECURITY: this record contains access & refresh tokens. Whatever backend
 * stores it (file or SQLite) lives under the git-ignored `data/` folder.
 * In production prefer an encrypted secret store.
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

/**
 * Pluggable persistence backend for shop accounts. Implementations must be
 * synchronous to keep the existing call sites simple.
 */
export interface StoreBackend {
  /** All accounts, ordered by when they were connected (oldest first). */
  list(): ShopAccount[];
  /** A single account by shop id, or undefined when not connected. */
  get(shopId: number): ShopAccount | undefined;
  /**
   * Insert or update an account. `connectedAt` of an existing account is
   * preserved (the first connection time is never overwritten).
   */
  upsert(account: ShopAccount): ShopAccount;
  /** Remove an account. Returns true if something was deleted. */
  remove(shopId: number): boolean;
}
