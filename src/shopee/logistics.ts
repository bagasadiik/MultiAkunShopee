import { callShop } from './client';
import { getValidAccount } from './auth';

const TRACKING_NUMBER_PATH = '/api/v2/logistics/get_tracking_number';
const TRACKING_INFO_PATH = '/api/v2/logistics/get_tracking_info';

interface TrackingNumberResponse {
  tracking_number?: string;
  plp_number?: string;
  first_mile_tracking_number?: string;
  last_mile_tracking_number?: string;
}

/** A single checkpoint in the delivery journey. */
export interface TrackingCheckpoint {
  update_time?: number;
  description?: string;
  logistics_status?: string;
}

interface TrackingInfoResponse {
  order_sn?: string;
  logistics_status?: string;
  tracking_info?: TrackingCheckpoint[];
}

export interface TrackingResult {
  orderSn: string;
  trackingNumber?: string;
  logisticsStatus?: string;
  checkpoints: TrackingCheckpoint[];
}

/**
 * Get the carrier tracking number (resi) for an order.
 * Returns undefined when the order has no shipping label yet.
 */
export async function getTrackingNumber(
  shopId: number,
  orderSn: string,
  packageNumber?: string,
): Promise<string | undefined> {
  const account = await getValidAccount(shopId);
  const body = await callShop<TrackingNumberResponse>(TRACKING_NUMBER_PATH, {
    accessToken: account.accessToken,
    shopId,
    query: { order_sn: orderSn, package_number: packageNumber },
  });
  return body.response?.tracking_number || body.response?.last_mile_tracking_number;
}

/**
 * Get the full delivery tracking timeline for an order.
 */
export async function getTrackingInfo(
  shopId: number,
  orderSn: string,
  packageNumber?: string,
): Promise<TrackingResult> {
  const account = await getValidAccount(shopId);
  const body = await callShop<TrackingInfoResponse>(TRACKING_INFO_PATH, {
    accessToken: account.accessToken,
    shopId,
    query: { order_sn: orderSn, package_number: packageNumber },
  });

  const resp = body.response;
  return {
    orderSn,
    logisticsStatus: resp?.logistics_status,
    checkpoints: (resp?.tracking_info ?? []).slice().sort(
      (a, b) => (b.update_time ?? 0) - (a.update_time ?? 0),
    ),
  };
}

/**
 * Best-effort: combine tracking number + timeline. Never throws — returns an
 * empty result if the order isn't shippable yet or logistics calls fail.
 */
export async function getTracking(shopId: number, orderSn: string): Promise<TrackingResult> {
  const result: TrackingResult = { orderSn, checkpoints: [] };
  try {
    result.trackingNumber = await getTrackingNumber(shopId, orderSn);
  } catch {
    /* no label yet / not applicable */
  }
  try {
    const info = await getTrackingInfo(shopId, orderSn);
    result.logisticsStatus = info.logisticsStatus;
    result.checkpoints = info.checkpoints;
  } catch {
    /* tracking timeline not available yet */
  }
  return result;
}
