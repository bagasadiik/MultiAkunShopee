import { callShop } from './client';
import { getValidAccount } from './auth';
import { upsertAccount } from '../store/tokenStore';

const SHOP_INFO_PATH = '/api/v2/shop/get_shop_info';

export interface ShopInfo {
  shop_name?: string;
  region?: string;
  status?: string;
  shop_id?: number;
}

/**
 * Fetch basic shop profile (name, region, status). Used to label accounts
 * in the dashboard. Caches the resolved name back into the token store.
 */
export async function getShopInfo(shopId: number): Promise<ShopInfo> {
  const account = await getValidAccount(shopId);
  // get_shop_info returns fields at the top level of the envelope.
  const body = await callShop<unknown>(SHOP_INFO_PATH, {
    accessToken: account.accessToken,
    shopId,
  });

  const info = body as unknown as ShopInfo;
  if (info.shop_name && info.shop_name !== account.shopName) {
    upsertAccount({ ...account, shopName: info.shop_name, region: info.region ?? account.region });
  }
  return info;
}
