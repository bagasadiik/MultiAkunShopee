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

  return el('tr', {}, [
    el('td', { className: 'order-sn' }, order.order_sn),
    el('td', {}, shopName),
    el('td', {}, statusCell),
    el('td', {}, fmtMoney(order.total_amount, order.currency)),
    el('td', {}, order.buyer_username || '—'),
    el('td', {}, (items || '—') + moreItems),
    el('td', {}, fmtDateTime(order.create_time)),
  ]);
}

async function loadOrders() {
  const body = $('#orders-body');
  const summary = $('#orders-summary');
  const errorsBox = $('#orders-errors');
  const btn = $('#load-orders');

  const shopId = $('#filter-shop').value;
  const days = $('#filter-days').value;
  const status = $('#filter-status').value;

  const params = new URLSearchParams();
  if (days) params.set('days', days);
  if (status) params.set('status', status);

  const path = shopId
    ? `/api/shops/${shopId}/orders?${params}`
    : `/api/orders?${params}`;

  btn.classList.add('loading');
  body.innerHTML = '<tr><td colspan="7" class="muted">Memuat pesanan…</td></tr>';
  errorsBox.hidden = true;
  summary.hidden = true;

  try {
    const data = await api(path);
    const orders = data.orders || [];

    body.innerHTML = '';
    if (orders.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="muted">Tidak ada pesanan pada rentang ini.</td></tr>';
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
    body.innerHTML = `<tr><td colspan="7" class="muted">Gagal memuat: ${e.message}</td></tr>`;
  } finally {
    btn.classList.remove('loading');
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
  $('#refresh-shops').addEventListener('click', loadShops);
  $('#load-orders').addEventListener('click', loadOrders);

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
