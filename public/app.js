'use strict';

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) {
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

function fmtDateTime(epochSeconds) {
  if (!epochSeconds) return '—';
  return new Date(epochSeconds * 1000).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtMoney(amount, currency) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || ''} ${amount}`;
  }
}

const STATUS_LABEL = {
  UNPAID: 'Belum dibayar',
  READY_TO_SHIP: 'Siap kirim',
  PROCESSED: 'Diproses',
  SHIPPED: 'Dikirim',
  COMPLETED: 'Selesai',
  IN_CANCEL: 'Proses batal',
  CANCELLED: 'Dibatalkan',
  INVOICE_PENDING: 'Menunggu faktur',
};

// ---------------------------------------------------------------------------
// Setup banner / status
// ---------------------------------------------------------------------------
async function loadStatus() {
  try {
    const status = await api('/api/status');
    const banner = $('#setup-banner');
    if (!status.configured) {
      banner.hidden = false;
      banner.innerHTML =
        'Aplikasi belum dikonfigurasi. Lengkapi <b>' +
        status.missing.join(', ') +
        '</b> di file <code>.env</code>, lalu mulai ulang server.';
    } else {
      banner.hidden = true;
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------
function shopCard(shop) {
  const statusPill = shop.expired
    ? el('span', { className: 'pill pill-expired' }, 'Token kedaluwarsa')
    : el('span', { className: 'pill pill-ok' }, 'Aktif');

  const refreshBtn = el('button', { className: 'btn btn-ghost btn-sm', type: 'button' }, 'Refresh token');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('loading');
    try {
      await api(`/api/shops/${shop.shopId}/refresh`, { method: 'POST' });
      await loadShops();
    } catch (e) {
      alert('Gagal refresh token: ' + e.message);
    } finally {
      refreshBtn.classList.remove('loading');
    }
  });

  const removeBtn = el('button', { className: 'btn btn-danger btn-sm', type: 'button' }, 'Putuskan');
  removeBtn.addEventListener('click', async () => {
    if (!confirm(`Putuskan toko ${shop.shopName || shop.shopId}?`)) return;
    try {
      await api(`/api/shops/${shop.shopId}`, { method: 'DELETE' });
      await loadShops();
    } catch (e) {
      alert('Gagal memutuskan: ' + e.message);
    }
  });

  return el('div', { className: 'shop' }, [
    el('div', { className: 'shop-name' }, shop.shopName || 'Toko tanpa nama'),
    el('div', { className: 'shop-id' }, `Shop ID: ${shop.shopId}${shop.region ? ' · ' + shop.region.toUpperCase() : ''}`),
    statusPill,
    el('div', { className: 'shop-meta' }, `Token berlaku s/d ${new Date(shop.expiresAt).toLocaleString('id-ID')}`),
    el('div', { className: 'shop-actions' }, [refreshBtn, removeBtn]),
  ]);
}

let SHOPS = [];

async function loadShops() {
  const container = $('#shops');
  container.classList.add('loading');
  try {
    const data = await api('/api/shops');
    SHOPS = data.shops || [];
    container.innerHTML = '';
    if (SHOPS.length === 0) {
      container.append(
        el('p', { className: 'muted' }, 'Belum ada toko. Klik "+ Hubungkan Toko" untuk mulai.'),
      );
    } else {
      SHOPS.forEach((s) => container.append(shopCard(s)));
    }
    populateShopFilter();
  } catch (e) {
    container.innerHTML = '';
    container.append(el('p', { className: 'muted' }, 'Gagal memuat toko: ' + e.message));
  } finally {
    container.classList.remove('loading');
  }
}

function populateShopFilter() {
  const select = $('#filter-shop');
  const current = select.value;
  select.innerHTML = '';
  select.append(el('option', { value: '' }, 'Semua toko'));
  SHOPS.forEach((s) => {
    select.append(el('option', { value: String(s.shopId) }, s.shopName || `Toko ${s.shopId}`));
  });
  select.value = current;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
function currentFilters() {
  const shopId = $('#filter-shop').value;
  const days = $('#filter-days').value;
  const status = $('#filter-status').value;
  const params = new URLSearchParams();
  if (days) params.set('days', days);
  if (status) params.set('status', status);
  return { shopId, params };
}

function orderRow(order) {
  const shopName = order.shopName || `Toko ${order.shopId}`;
  const status = order.order_status || '—';
  const statusCell = el(
    'span',
    { className: `pill status-${status}` },
    STATUS_LABEL[status] || status,
  );

  const items = (order.item_list || [])
    .map((it) => `${it.item_name || 'Item'}${it.model_quantity_purchased ? ' ×' + it.model_quantity_purchased : ''}`)
    .slice(0, 3)
    .join(', ');
  const moreItems = (order.item_list || []).length > 3 ? ` +${order.item_list.length - 3} lainnya` : '';

  const detailBtn = el('button', { className: 'btn btn-ghost btn-sm', type: 'button' }, 'Detail');
  detailBtn.addEventListener('click', () => openOrderDetail(order.shopId, order.order_sn));

  return el('tr', {}, [
    el('td', { className: 'order-sn' }, order.order_sn),
    el('td', {}, shopName),
    el('td', {}, statusCell),
    el('td', {}, fmtMoney(order.total_amount, order.currency)),
    el('td', {}, order.buyer_username || '—'),
    el('td', {}, (items || '—') + moreItems),
    el('td', {}, fmtDateTime(order.create_time)),
    el('td', {}, detailBtn),
  ]);
}

async function loadOrders() {
  const body = $('#orders-body');
  const summary = $('#orders-summary');
  const errorsBox = $('#orders-errors');
  const btn = $('#load-orders');

  const { shopId, params } = currentFilters();

  const path = shopId
    ? `/api/shops/${shopId}/orders?${params}`
    : `/api/orders?${params}`;

  btn.classList.add('loading');
  body.innerHTML = '<tr><td colspan="8" class="muted">Memuat pesanan…</td></tr>';
  errorsBox.hidden = true;
  summary.hidden = true;

  try {
    const data = await api(path);
    const orders = data.orders || [];

    body.innerHTML = '';
    if (orders.length === 0) {
      body.innerHTML = '<tr><td colspan="8" class="muted">Tidak ada pesanan pada rentang ini.</td></tr>';
    } else {
      orders.forEach((o) => body.append(orderRow(o)));
    }

    // Summary
    const total = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const currency = orders.find((o) => o.currency)?.currency || 'IDR';
    summary.hidden = false;
    summary.innerHTML = '';
    summary.append(
      el('div', {}, [el('div', { className: 'muted' }, 'Jumlah pesanan'), el('b', {}, String(orders.length))]),
      el('div', {}, [el('div', { className: 'muted' }, 'Estimasi nilai'), el('b', {}, fmtMoney(total, currency))]),
    );

    // Per-shop errors (aggregated endpoint)
    if (data.errors && data.errors.length) {
      errorsBox.hidden = false;
      errorsBox.innerHTML =
        'Sebagian toko gagal dimuat:<br>' +
        data.errors
          .map((e) => `• ${e.shopName || 'Toko ' + e.shopId}: ${e.error}`)
          .join('<br>');
    }
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="muted">Gagal memuat: ${e.message}</td></tr>`;
  } finally {
    btn.classList.remove('loading');
  }
}

function exportCsv() {
  const { shopId, params } = currentFilters();
  const url = shopId
    ? `/api/shops/${shopId}/orders/export.csv?${params}`
    : `/api/orders/export.csv?${params}`;
  // Trigger a browser download (endpoint sets Content-Disposition: attachment).
  window.location.assign(url);
}

// ---------------------------------------------------------------------------
// Order detail modal
// ---------------------------------------------------------------------------
function closeModal() {
  $('#modal-overlay').hidden = true;
}

function kv(label, value) {
  return el('div', { className: 'kv' }, [
    el('span', { className: 'kv-label' }, label),
    el('span', { className: 'kv-value' }, value == null || value === '' ? '—' : String(value)),
  ]);
}

function renderTracking(tracking) {
  const wrap = el('div', { className: 'tracking' });
  wrap.append(el('h4', {}, 'Pengiriman / Resi'));
  wrap.append(kv('No. Resi', tracking.trackingNumber || '—'));
  wrap.append(kv('Status logistik', tracking.logisticsStatus || '—'));

  const checkpoints = tracking.checkpoints || [];
  if (checkpoints.length === 0) {
    wrap.append(el('p', { className: 'muted' }, 'Belum ada riwayat pengiriman.'));
    return wrap;
  }
  const timeline = el('ul', { className: 'timeline' });
  checkpoints.forEach((c) => {
    timeline.append(
      el('li', {}, [
        el('div', { className: 'timeline-time' }, fmtDateTime(c.update_time)),
        el('div', { className: 'timeline-desc' }, c.description || c.logistics_status || '—'),
      ]),
    );
  });
  wrap.append(timeline);
  return wrap;
}

function renderOrderDetail(order, tracking) {
  const bodyEl = $('#modal-body');
  bodyEl.innerHTML = '';
  $('#modal-title').textContent = `Pesanan ${order.order_sn}`;

  // Summary grid
  const grid = el('div', { className: 'detail-grid' });
  grid.append(
    kv('Toko', order.shopName || `Toko ${order.shopId}`),
    kv('Status', STATUS_LABEL[order.order_status] || order.order_status || '—'),
    kv('Total', fmtMoney(order.total_amount, order.currency)),
    kv('Pembeli', order.buyer_username),
    kv('Metode bayar', order.payment_method),
    kv('Kurir', order.shipping_carrier),
    kv('COD', order.cod === undefined ? '—' : order.cod ? 'Ya' : 'Tidak'),
    kv('Dibuat', fmtDateTime(order.create_time)),
  );
  bodyEl.append(grid);

  if (order.message_to_seller) {
    bodyEl.append(kv('Pesan pembeli', order.message_to_seller));
  }

  // Recipient
  if (order.recipient_address) {
    const r = order.recipient_address;
    bodyEl.append(el('h4', {}, 'Penerima'));
    bodyEl.append(kv('Nama', r.name));
    bodyEl.append(kv('Kota/Wilayah', [r.city, r.state, r.region].filter(Boolean).join(', ')));
  }

  // Items
  bodyEl.append(el('h4', {}, 'Produk'));
  const items = order.item_list || [];
  if (items.length === 0) {
    bodyEl.append(el('p', { className: 'muted' }, 'Tidak ada item.'));
  } else {
    const list = el('ul', { className: 'item-list' });
    items.forEach((it) => {
      const qty = it.model_quantity_purchased ? ` ×${it.model_quantity_purchased}` : '';
      const model = it.model_name ? ` — ${it.model_name}` : '';
      const price = it.model_discounted_price != null
        ? ` (${fmtMoney(it.model_discounted_price, order.currency)})`
        : '';
      list.append(el('li', {}, `${it.item_name || 'Item'}${model}${qty}${price}`));
    });
    bodyEl.append(list);
  }

  // Tracking
  bodyEl.append(renderTracking(tracking || { checkpoints: [] }));
}

async function openOrderDetail(shopId, orderSn) {
  const overlay = $('#modal-overlay');
  overlay.hidden = false;
  $('#modal-title').textContent = `Pesanan ${orderSn}`;
  $('#modal-body').innerHTML = '<p class="muted">Memuat…</p>';
  try {
    const data = await api(`/api/shops/${shopId}/orders/${encodeURIComponent(orderSn)}`);
    renderOrderDetail(data.order, data.tracking);
  } catch (e) {
    $('#modal-body').innerHTML = `<p class="muted">Gagal memuat detail: ${e.message}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
  $('#refresh-shops').addEventListener('click', loadShops);
  $('#load-orders').addEventListener('click', loadOrders);
  $('#export-csv').addEventListener('click', exportCsv);

  // Modal close: button, overlay click, and Escape key.
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#modal-overlay')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // If we just came back from a successful OAuth connect, clean the URL.
  const url = new URL(window.location.href);
  if (url.searchParams.has('connected')) {
    url.searchParams.delete('connected');
    window.history.replaceState({}, '', url.pathname);
  }

  loadStatus();
  loadShops();
}

document.addEventListener('DOMContentLoaded', init);
