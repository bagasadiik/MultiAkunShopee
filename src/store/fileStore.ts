import fs from 'node:fs';
import path from 'node:path';
import { ShopAccount, StoreBackend } from './types';

interface StoreShape {
  shops: Record<string, ShopAccount>;
}

/**
 * JSON-file backed token store. Zero dependencies, works on any Node version.
 * Good default for a single self-hosted dashboard.
 */
export class FileStore implements StoreBackend {
  private readonly file: string;

  constructor(private readonly dataDir: string) {
    this.file = path.join(dataDir, 'accounts.json');
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private read(): StoreShape {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw) as StoreShape;
      return parsed.shops ? parsed : { shops: {} };
    } catch {
      return { shops: {} };
    }
  }

  private write(data: StoreShape): void {
    this.ensureDir();
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
  }

  list(): ShopAccount[] {
    return Object.values(this.read().shops).sort((a, b) => a.connectedAt - b.connectedAt);
  }

  get(shopId: number): ShopAccount | undefined {
    return this.read().shops[String(shopId)];
  }

  upsert(account: ShopAccount): ShopAccount {
    const data = this.read();
    const existing = data.shops[String(account.shopId)];
    data.shops[String(account.shopId)] = {
      ...existing,
      ...account,
      connectedAt: existing?.connectedAt ?? account.connectedAt,
    };
    this.write(data);
    return data.shops[String(account.shopId)];
  }

  remove(shopId: number): boolean {
    const data = this.read();
    if (!data.shops[String(shopId)]) return false;
    delete data.shops[String(shopId)];
    this.write(data);
    return true;
  }
}
