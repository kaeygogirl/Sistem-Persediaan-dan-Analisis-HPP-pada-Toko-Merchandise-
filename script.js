'use strict';

const state = {
  currentPage: 'dashboard', products: [], suppliers: [], categories: [], sizes: [],
  productPage: 1, supplierPage: 1, purchasePage: 1, outgoingPage: 1, stockPage: 1,
  outgoingTab: 'penjualan', charts: {}, invoicePath: null,
  productPhotoPath: null, ignoredReviews: JSON.parse(localStorage.getItem('wm-ignored-reviews') || '[]'),
  debounce: {}
};
const SUPABASE_URL = 'https://bxsoljmuzwjrpvsrawnu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_phjuZESBR1om-ByOAaFqNg_jGiUiVy2';
const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  : null;
if (!window.lucide) {
  console.warn('Lucide Icons tidak tersedia; tampilan ikon dinonaktifkan.');
  window.lucide = { createIcons() {} };
}
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const icons = {
  dashboard: 'layout-dashboard', produk: 'package', supplier: 'truck', 'barang-masuk': 'arrow-down-to-line',
  'barang-keluar': 'arrow-up-from-line', 'kartu-persediaan': 'clipboard-list', 'analisis-hpp': 'chart-no-axes-combined', settings: 'settings-2'
};
const titles = {
  dashboard: 'Dashboard', produk: 'Produk', supplier: 'Supplier', 'barang-masuk': 'Barang Masuk',
  'barang-keluar': 'Barang Keluar', 'kartu-persediaan': 'Kartu Persediaan', 'analisis-hpp': 'Analisis HPP', settings: 'Settings'
};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const money = v => rupiah.format(Number(v) || 0);
const qtyFmt = v => number.format(Number(v) || 0);
const pct = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const movementTypeLabel = value => ({
  penjualan:'Penjualan',pembelian:'Barang masuk',retur_penjualan:'Penukaran customer',
  retur_ke_supplier:'Retur ke supplier',write_off_rusak:'Barang rusak',
  write_off_kadaluarsa:'Barang kedaluwarsa',write_off_hilang:'Barang hilang',
  barang_rusak:'Barang rusak',barang_hilang:'Barang hilang',
  koreksi_kurang:'Koreksi stok kurang',koreksi_lebih:'Koreksi stok lebih',
  disposal:'Disposal',donasi:'Donasi',void:'Dibatalkan'
}[value]||String(value||'').replaceAll('_',' '));
const formatDate = v => v ? dateFmt.format(new Date(`${String(v).slice(0,10)}T00:00:00`)) : '—';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
function reportBounds(period, extended = false) {
  const now = new Date();
  const local = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const end = local(now);
  if (period === 'hari_ini') return [end, end];
  if (!extended) {
    if (period === 'minggu_ini') {
      const start = new Date(now);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return [local(start), end];
    }
    return [`${end.slice(0, 7)}-01`, end];
  }
  if (period === '7_hari') {
    const start = new Date(now); start.setDate(start.getDate() - 6); return [local(start), end];
  }
  if (period === 'bulan_lalu') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const finish = new Date(now.getFullYear(), now.getMonth(), 0);
    return [local(start), local(finish)];
  }
  if (period === 'triwulan_ini') {
    const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return [local(start), end];
  }
  if (period === '6_bulan') {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return [local(start), end];
  }
  if (period === 'tahun_ini') return [`${now.getFullYear()}-01-01`, end];
  if (period === 'tahun_lalu') return [`${now.getFullYear()-1}-01-01`, `${now.getFullYear()-1}-12-31`];
  return [`${end.slice(0, 7)}-01`, end];
}
function publicStorageUrl(bucket, filePath) {
  if (!filePath || !supabaseClient) return '';
  return supabaseClient.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
}
const idrInput = v => Number(v || 0).toLocaleString('id-ID');

async function api(url, options = {}) {
  if (!supabaseClient) throw new Error('Library Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.');
  const baseUrl = window.location.protocol === 'file:' ? 'http://localhost/' : window.location.href;
  const requestUrl = new URL(url, baseUrl);
  const path = requestUrl.pathname.replace(/^\/api\/?/, '').replace(/^\/+|\/+$/g, '');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = requestUrl.searchParams;
  const method = options.method || 'GET';
  const payload = options.body instanceof FormData ? options.body : options.body ? JSON.parse(options.body) : {};
  const from = table => supabaseClient.from(table);
  const query = (table, columns = '*', selectOptions) => from(table).select(columns, selectOptions);
  const run = async promise => {
    const { data, error, count } = await promise;
    if (error) {
      const failure = new Error(error.message || 'Permintaan ke Supabase gagal.');
      failure.code = error.code;
      throw failure;
    }
    return { data, count };
  };
  const rows = async (table, columns, configure = q => q) => (await run(configure(query(table, columns)))).data || [];
  const one = async (promise, optional = false) => {
    const result = await run(promise);
    if (!result.data && !optional) throw new Error('Data tidak ditemukan.');
    return result.data;
  };
  const rpc = async (name, args = {}) => one(supabaseClient.rpc(name, args));
  const paged = async (table, columns, configure = q => q) => {
    const page = Math.max(1, Number(params.get('page') || 1));
    const limit = Math.max(1, Math.min(500, Number(params.get('limit') || 20)));
    let q = configure(query(table, columns, { count: 'exact' }));
    const result = await run(q.range((page - 1) * limit, page * limit - 1));
    return { items: result.data || [], page, limit, total: result.count || 0 };
  };
  const searchLike = (q, column, value) => value ? q.ilike(column, `%${String(value).replace(/[%_,]/g, '\\$&')}%`) : q;
  const fileUrl = (bucket, filePath) => {
    if (!filePath) return null;
    const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  };

  if (path === 'health') {
    await run(query('pengaturan', 'key').limit(1));
    return { supabase: 'connected' };
  }
  if (path === 'config/nota') {
    const settings = await rows('pengaturan', 'key,value', q => q.in('key', ['nama_toko', 'alamat_toko', 'telepon_toko', 'footer_nota']));
    const values = Object.fromEntries(settings.map(item => [item.key, item.value]));
    return { nama_toko: values.nama_toko || 'Wonder Merch (Nama toko belum diatur)', alamat: values.alamat_toko || '', telepon: values.telepon_toko || '', footer: values.footer_nota || 'Terima kasih telah berbelanja!' };
  }
  if (path === 'file-url') return { url: fileUrl(params.get('bucket'), params.get('path')) };
  if (path === 'upload-invoice' || path === 'upload-foto-produk') {
    const file = payload.get('file');
    if (!file) throw new Error('Pilih file terlebih dahulu.');
    const invoice = path === 'upload-invoice';
    const bucket = invoice ? 'invoices' : 'produk-images';
    const validTypes = invoice ? ['application/pdf', 'image/jpeg', 'image/png'] : ['image/jpeg', 'image/png'];
    const maxBytes = (invoice ? 10 : 2) * 1024 * 1024;
    if (!validTypes.includes(file.type)) throw new Error(invoice ? 'Format invoice harus PDF, JPG, JPEG, atau PNG.' : 'Format foto harus JPG, JPEG, atau PNG.');
    if (file.size > maxBytes) throw new Error(`Ukuran file maksimal ${invoice ? 10 : 2} MB.`);
    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
    let fileId;
    if (window.crypto?.randomUUID) fileId = window.crypto.randomUUID();
    else if (window.crypto?.getRandomValues) {
      const bytes = window.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      fileId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    } else throw new Error('Browser tidak menyediakan generator UUID yang aman untuk upload.');
    const filePath = `${fileId}.${extension}`;
    const { data, error } = await supabaseClient.storage.from(bucket).upload(filePath, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message || 'File gagal diunggah.');
    return { path: data.path, url: fileUrl(bucket, data.path) };
  }

  if (parts[0] === 'produk') {
    if (parts[1] === 'margin-review') return rpc('produk_margin_review', { p_ignored: (params.get('ignored') || '').split(',').filter(Boolean).map(Number) });
    if (parts[1] === 'bulk-set-margin' && method === 'POST') return rpc('bulk_set_margin', { p_ids: payload.ids, p_margin: Number(payload.margin_target) });
    if (parts[1] && parts[2] === 'hitung-harga' && method === 'POST') {
      return rpc('hitung_harga_produk', { p_id: Number(parts[1]), p_margin: Number(payload.margin_target), p_update: payload.update !== false });
    }
    if (parts[1] && method === 'GET') {
      return one(query('produk', '*,kategori:kategori!produk_kategori_id_fkey(*),ukuran:ukuran(*)').eq('id', parts[1]).maybeSingle());
    }
    if (parts[1] && method === 'PUT') {
      const patch = { ...payload };
      delete patch.sku; delete patch.stok_saat_ini; delete patch.hpp;
      if (patch.harga_jual !== undefined) {
        const current = await one(query('produk', 'hpp').eq('id', parts[1]).maybeSingle());
        patch.last_price_hpp = current.hpp;
      }
      return one(from('produk').update(patch).eq('id', parts[1]).select().single());
    }
    if (parts[1] && method === 'DELETE') {
      const [purchase, sale, adjustment] = await Promise.all([
        one(query('detail_pembelian', 'id').eq('produk_id', parts[1]).limit(1).maybeSingle(), true),
        one(query('detail_penjualan', 'id').eq('produk_id', parts[1]).limit(1).maybeSingle(), true),
        one(query('detail_penyesuaian', 'id').eq('produk_id', parts[1]).limit(1).maybeSingle(), true)
      ]);
      if (purchase || sale || adjustment) return one(from('produk').update({ status_aktif: false }).eq('id', parts[1]).select().single());
      await run(from('produk').delete().eq('id', parts[1]));
      return { id: Number(parts[1]) };
    }
    if (method === 'POST') return one(from('produk').insert({
      nama: payload.nama.trim(), kategori_id: Number(payload.kategori_id), satuan: payload.satuan.trim(),
      ukuran_id: payload.ukuran_id ? Number(payload.ukuran_id) : null, foto_path: payload.foto_path || null,
      stok_minimum: Number(payload.stok_minimum || 0), harga_jual: Number(payload.harga_jual || 0),
      margin_target: Number(payload.margin_target || 0), status_aktif: true
    }).select().single());
    const page = Math.max(1, Number(params.get('page') || 1)), limit = Math.max(1, Number(params.get('limit') || 20));
    let q = query('produk', '*,kategori:kategori!produk_kategori_id_fkey(id,nama,kode,parent_id,butuh_ukuran),ukuran:ukuran(id,nilai)', { count: 'exact' });
    q = params.get('status') === 'nonaktif' ? q.eq('status_aktif', false) : params.get('status') === 'all' ? q : q.eq('status_aktif', true);
    if (params.get('search')) q = q.or(`nama.ilike.%${params.get('search')}%,sku.ilike.%${params.get('search')}%`);
    if (params.get('subkategori_id')) q = q.eq('kategori_id', params.get('subkategori_id'));
    if (params.get('ukuran_id')) q = q.eq('ukuran_id', params.get('ukuran_id'));
    const sort = ['created_at', 'nama', 'sku', 'stok_saat_ini', 'harga_jual', 'hpp', 'updated_at'].includes(params.get('sort')) ? params.get('sort') : 'created_at';
    q = q.order(sort, { ascending: params.get('order') === 'asc' });
    const needsFilter = params.get('stok_minimum') === 'true' || Boolean(params.get('kategori_id'));
    if (!needsFilter) q = q.range((page - 1) * limit, page * limit - 1);
    const result = await run(q);
    let productRows = result.data || [];
    if (params.get('kategori_id')) {
      const cats = await rows('kategori', 'id', x => x.eq('parent_id', Number(params.get('kategori_id'))));
      const ids = cats.map(x => x.id);
      productRows = productRows.filter(x => ids.includes(x.kategori_id));
    }
    if (params.get('stok_minimum') === 'true') productRows = productRows.filter(x => x.stok_saat_ini <= x.stok_minimum);
    const total = needsFilter ? productRows.length : result.count || productRows.length;
    if (needsFilter) productRows = productRows.slice((page - 1) * limit, page * limit);
    return { items: productRows, page, limit, total };
  }

  if (parts[0] === 'supplier') {
    if (parts[1] && method === 'GET') {
      const supplier = await one(query('supplier').eq('id', parts[1]).maybeSingle());
      const history = await run(query('pembelian', '*', { count: 'exact' }).eq('supplier_id', parts[1]).order('tanggal', { ascending: false }).limit(100));
      supplier.riwayat_pembelian = history.data || [];
      supplier.total_transaksi = history.count || 0;
      supplier.total_pembelian = supplier.riwayat_pembelian.filter(x => x.status_transaksi === 'posted').reduce((sum, x) => sum + Number(x.total_biaya_perolehan), 0);
      return supplier;
    }
    if (parts[1] && method === 'PUT') return one(from('supplier').update(payload).eq('id', parts[1]).select().single());
    if (parts[1] && method === 'DELETE') {
      const used = await one(query('pembelian', 'id').eq('supplier_id', parts[1]).limit(1).maybeSingle(), true);
      if (used) return one(from('supplier').update({ status_aktif: false }).eq('id', parts[1]).select().single());
      await run(from('supplier').delete().eq('id', parts[1]));
      return { id: Number(parts[1]) };
    }
    if (method === 'POST') return one(from('supplier').insert({ ...payload, nama: payload.nama.trim(), status_aktif: true }).select().single());
    return paged('supplier', '*', q => {
      q = searchLike(q, 'nama', params.get('search'));
      if (params.get('status') === 'aktif') q = q.eq('status_aktif', true);
      if (params.get('status') === 'nonaktif') q = q.eq('status_aktif', false);
      return q.order(params.get('sort') === 'nama' ? 'nama' : 'created_at', { ascending: params.get('order') === 'asc' });
    });
  }

  if (parts[0] === 'kategori' || parts[0] === 'ukuran') {
    const tableName = parts[0];
    if (parts[1] && method === 'PUT') return one(from(tableName).update(payload).eq('id', parts[1]).select().single());
    if (parts[1] && method === 'DELETE') {
      const references = tableName === 'kategori'
        ? await Promise.all([
          one(query('produk', 'id').eq('kategori_id', parts[1]).limit(1).maybeSingle(), true),
          one(query('kategori', 'id').eq('parent_id', parts[1]).limit(1).maybeSingle(), true),
          one(query('ukuran', 'id').eq('kategori_id', parts[1]).limit(1).maybeSingle(), true)
        ])
        : [await one(query('produk', 'id').eq('ukuran_id', parts[1]).limit(1).maybeSingle(), true)];
      if (references.some(Boolean)) return one(from(tableName).update({ status_aktif: false }).eq('id', parts[1]).select().single());
      await run(from(tableName).delete().eq('id', parts[1]));
      return { id: Number(parts[1]) };
    }
    if (method === 'POST') {
      const body = tableName === 'kategori'
        ? { ...payload, nama: payload.nama.trim(), kode: payload.kode.trim().toUpperCase(), parent_id: payload.parent_id || null, butuh_ukuran: Boolean(payload.butuh_ukuran), urutan: Number(payload.urutan || 0) }
        : { ...payload, kategori_id: Number(payload.kategori_id), nilai: payload.nilai.trim(), urutan: Number(payload.urutan || 0) };
      return one(from(tableName).insert(body).select().single());
    }
    let q = query(tableName).order('urutan');
    if (tableName === 'kategori') q = q.order('nama');
    else {
      q = q.order('nilai');
      if (params.get('kategori_id')) q = q.eq('kategori_id', params.get('kategori_id'));
      if (params.get('all') !== 'true') q = q.eq('status_aktif', true);
    }
    return (await run(q)).data || [];
  }

  if (['pembelian', 'penjualan', 'penyesuaian'].includes(parts[0])) {
    const tableName = parts[0] === 'penyesuaian' ? 'penyesuaian_persediaan' : parts[0];
    if (parts[1] === 'retur' && method === 'POST') throw new Error('Pengembalian dana customer sedang dinonaktifkan. Gunakan proses penukaran barang.');
    if (parts[1] === 'tukar' && method === 'POST') return rpc('post_tukar_penjualan', { payload });
    if (parts[0] === 'penjualan' && parts[1] === 'asal' && parts[2]) {
      return one(query('penjualan', 'nomor_transaksi').eq('id', parts[2]).maybeSingle());
    }
    if (parts[0] === 'pembelian' && parts[1] === 'referensi' && parts[2]) {
      const purchase = await one(query('pembelian', '*,supplier:supplier(nama)').eq('id', parts[2]).maybeSingle());
      if (purchase.status_transaksi !== 'posted') throw new Error('Pembelian asal tidak aktif untuk retur.');
      const [details, returns] = await Promise.all([
        rows('detail_pembelian', '*,produk:produk(sku,nama)', q => q.eq('pembelian_id', purchase.id)),
        rows('penyesuaian_persediaan', 'detail_penyesuaian(produk_id,qty)', q =>
          q.eq('pembelian_asal_id', purchase.id).eq('jenis', 'retur_ke_supplier').eq('status_transaksi', 'posted'))
      ]);
      const returned = {};
      for (const record of returns) for (const detail of record.detail_penyesuaian || []) {
        returned[detail.produk_id] = (returned[detail.produk_id] || 0) + Math.abs(detail.qty);
      }
      return {
        ...purchase,
        details: details.map(detail => ({
          ...detail,
          qty_diretur: returned[detail.produk_id] || 0,
          qty_tersisa: detail.qty - (returned[detail.produk_id] || 0)
        }))
      };
    }
    if (parts[1] === 'referensi' && parts[2]) {
      const sale = await one(query('penjualan').eq('nomor_transaksi', parts[2]).eq('jenis_transaksi', 'penjualan').maybeSingle());
      const [details, returns] = await Promise.all([
        rows('detail_penjualan', '*,produk:produk(sku,nama,ukuran:ukuran(nilai))', q => q.eq('penjualan_id', sale.id)),
        rows('penjualan', 'id,kondisi_barang,jenis_transaksi,detail_penjualan(produk_id,qty)', q =>
          q.eq('penjualan_asal_id', sale.id).eq('jenis_transaksi', 'retur_penjualan').eq('status_transaksi', 'posted'))
      ]);
      const returned = {};
      for (const item of returns) for (const detail of item.detail_penjualan || []) returned[detail.produk_id] = (returned[detail.produk_id] || 0) + detail.qty;
      const elapsed = Math.floor((Date.now() - new Date(`${sale.tanggal}T00:00:00`).getTime()) / 86400000);
      const grouped = new Map();
      for (const detail of details) {
        const current = grouped.get(detail.produk_id) || { ...detail, qty: 0, subtotal_penjualan: 0, hpp_total: 0 };
        current.qty += Number(detail.qty);
        current.subtotal_penjualan += Number(detail.subtotal_penjualan || 0);
        current.hpp_total += Number(detail.hpp_total || 0);
        grouped.set(detail.produk_id, current);
      }
      return {
        ...sale,
        items: [...grouped.values()].map(d => ({
          ...d,
          harga_jual_satuan: d.qty ? Math.round((d.subtotal_penjualan / d.qty) * 10000) / 10000 : 0,
          hpp_snapshot_satuan: d.qty ? d.hpp_total / d.qty : 0,
          qty_diretur: returned[d.produk_id] || 0,
          qty_tersisa: d.qty - (returned[d.produk_id] || 0)
        })),
        batas_hari: 2,
        hari_berlalu: elapsed,
        bisa_ditukar: elapsed >= 0 && elapsed <= 2
      };
    }
    if (parts[1] && parts[2] === 'void' && method === 'POST') {
      const functionName = parts[0] === 'pembelian' ? 'void_pembelian' : parts[0] === 'penjualan' ? 'void_penjualan' : 'void_penyesuaian';
      const args = functionName === 'void_penyesuaian' ? { p_id: Number(parts[1]), p_alasan: payload.alasan } : { p_id: Number(parts[1]), alasan: payload.alasan };
      return rpc(functionName, args);
    }
    if (parts[1] && method === 'GET') {
      const head = await one(query(tableName, parts[0] === 'pembelian' ? '*,supplier:supplier(nama)' : '*').eq('id', parts[1]).maybeSingle());
      const detailTable = parts[0] === 'pembelian' ? 'detail_pembelian' : parts[0] === 'penjualan' ? 'detail_penjualan' : 'detail_penyesuaian';
      const foreignKey = parts[0] === 'pembelian' ? 'pembelian_id' : parts[0] === 'penjualan' ? 'penjualan_id' : 'penyesuaian_id';
      const relation = parts[0] === 'pembelian' ? 'produk:produk(sku,nama)' : parts[0] === 'penjualan' ? 'produk:produk(sku,nama,ukuran:ukuran(nilai))' : 'produk:produk(sku,nama)';
      head.details = await rows(detailTable, `*,${relation}`, q => q.eq(foreignKey, head.id));
      if (parts[0] === 'pembelian') head.invoice_url = fileUrl('invoices', head.invoice_path);
      return head;
    }
    if (method === 'POST') {
      const functionName = parts[0] === 'pembelian' ? 'post_pembelian' : parts[0] === 'penjualan' ? 'post_penjualan' : 'post_penyesuaian';
      return rpc(functionName, { payload });
    }
    const sortOptions = parts[0] === 'pembelian' ? ['tanggal', 'created_at', 'total_biaya_perolehan', 'nomor_transaksi'] : ['tanggal', 'created_at', 'total_penjualan', 'nomor_transaksi'];
    return paged(tableName, parts[0] === 'pembelian' ? '*,supplier:supplier(nama)' : '*', q => {
      const sorted = sortOptions.includes(params.get('sort')) ? params.get('sort') : 'tanggal';
      q = q.order(sorted, { ascending: params.get('order') === 'asc' });
      if (params.get('tanggal_awal')) q = q.gte('tanggal', params.get('tanggal_awal'));
      if (params.get('tanggal_akhir')) q = q.lte('tanggal', params.get('tanggal_akhir'));
      if (params.get('status')) q = q.eq('status_transaksi', params.get('status'));
      if (parts[0] === 'pembelian' && params.get('supplier_id')) q = q.eq('supplier_id', params.get('supplier_id'));
      if (parts[0] === 'penjualan' && params.get('jenis')) q = q.eq('jenis_transaksi', params.get('jenis'));
      return searchLike(q, 'nomor_transaksi', params.get('search'));
    });
  }

  if (parts[0] === 'kartu-persediaan') {
    const stockRows = await rpc('hitung_kartu_persediaan', {
      p_produk_id: params.get('produk_id') ? Number(params.get('produk_id')) : null,
      p_tanggal_awal: params.get('tanggal_awal') || null, p_tanggal_akhir: params.get('tanggal_akhir') || null
    });
    let filtered = stockRows || [];
    if (params.get('jenis')) filtered = filtered.filter(x => x.jenis === params.get('jenis'));
    if (params.get('search')) filtered = filtered.filter(x => `${x.sku} ${x.nama_produk} ${x.nomor_transaksi}`.toLowerCase().includes(params.get('search').toLowerCase()));
    if (params.get('kategori_id')) {
      const cats = await rows('kategori', 'id,parent_id');
      const ids = cats.filter(c => String(c.id) === params.get('kategori_id') || String(c.parent_id) === params.get('kategori_id')).map(c => c.id);
      const products = await rows('produk', 'id,kategori_id');
      const productIds = products.filter(p => ids.includes(p.kategori_id)).map(p => p.id);
      filtered = filtered.filter(x => productIds.includes(x.produk_id));
    }
    if (parts[1] === 'export') return filtered;
    const page = Math.max(1, Number(params.get('page') || 1)), limit = Math.max(1, Number(params.get('limit') || 20));
    return { items: filtered.slice((page - 1) * limit, page * limit), page, limit, total: filtered.length };
  }
  if (parts[0] === 'dashboard') {
    const [start, end] = reportBounds(params.get('periode') || 'bulan_ini');
    return { ...(await rpc('dashboard_report', { p_awal: start, p_akhir: end })), periode: [start, end] };
  }
  if (parts[0] === 'analisis-hpp') {
    if (parts[1] === 'performa-kategori') return rpc('performa_kategori_report', { p_level: params.get('level') === 'subkategori' ? 'subkategori' : 'induk' });
    if (parts[1] === 'periodik') return rpc('analisis_periodik_report', { p_type: params.get('type') || 'bulanan', p_year: Number(params.get('tahun') || new Date().getFullYear()) });
    const [start, end] = params.get('tanggal_awal') && params.get('tanggal_akhir')
      ? [params.get('tanggal_awal'), params.get('tanggal_akhir')]
      : reportBounds(params.get('periode') || 'bulan_ini', true);
    return { ...(await rpc('analisis_hpp_report', { p_awal: start, p_akhir: end })), periode: { awal: start, akhir: end } };
  }
  if (parts[0] === 'pengaturan') {
    if (method === 'PUT') return rpc('save_pengaturan', { payload });
    const settings = await rows('pengaturan', 'key,value,tipe,deskripsi');
    return Object.fromEntries(settings.map(item => [item.key, item]));
  }
  throw new Error(`Fitur ${path} belum tersedia pada koneksi Supabase langsung.`);
}
async function apiPost(url, payload) {
  return api(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
}
async function apiPut(url, payload) {
  return api(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
}
function toast(message, type = 'success', detail = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  const icon = type === 'success' ? 'circle-check' : type === 'error' ? 'circle-alert' : 'info';
  node.innerHTML = `<i data-lucide="${icon}"></i><div><strong>${type === 'error'?'Tidak berhasil':type==='info'?'Informasi':'Berhasil'}</strong><p>${esc(message)}${detail?`<br>${esc(detail)}`:''}</p></div>`;
  $('#toast-stack').append(node); lucide.createIcons();
  setTimeout(() => node.remove(), 5000);
}
function loading(on) { $('#global-loading').classList.toggle('hidden', !on); }
async function guarded(task, { showLoading = false, success = null } = {}) {
  if (showLoading) loading(true);
  try { const result=await task(); if(success) toast(success); return result; }
  catch(error) { toast(error.message || 'Terjadi kesalahan.', 'error', error.detail || ''); error.wmToasted=true; throw error; }
  finally { if(showLoading) loading(false); }
}
function debounce(key, fn, delay = 300) {
  clearTimeout(state.debounce[key]);
  state.debounce[key] = setTimeout(fn, delay);
}
function emptyState(title, copy, cta = '', action = '') {
  return `<div class="empty-state"><div class="empty-illustration"><i data-lucide="package-open"></i></div><strong>${esc(title)}</strong><p>${esc(copy)}</p>${cta?`<button class="button button-primary" data-action="${esc(action)}"><i data-lucide="plus"></i>${esc(cta)}</button>`:''}</div>`;
}
function table(headers, rows, emptyTitle = 'Belum ada data.', emptyText = 'Data akan tampil setelah transaksi dicatat.') {
  if (!rows.length) return emptyState(emptyTitle, emptyText);
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function pager(target, page, total, limit = 20) {
  const count=Math.ceil((total||0)/limit);
  if (!count || count===1) { $(target).innerHTML=`<span>Menampilkan ${total||0} data</span><span></span>`; return; }
  const start=Math.max(1,page-2), end=Math.min(count,page+2);
  $(target).innerHTML=`<span>Halaman ${page} dari ${count} · ${total} data</span><div class="page-buttons">${page>1?`<button class="page-btn" data-page="${page-1}">‹</button>`:''}${Array.from({length:end-start+1},(_,i)=>start+i).map(n=>`<button class="page-btn ${n===page?'active':''}" data-page="${n}">${n}</button>`).join('')}${page<count?`<button class="page-btn" data-page="${page+1}">›</button>`:''}</div>`;
}
function bindPager(selector, setter, loader) {
  $(selector).addEventListener('click', e => {
    const b=e.target.closest('[data-page]'); if (!b) return;
    setter(Number(b.dataset.page)); loader();
  });
}
function modal(title, body, { wide = false, submitText = 'Simpan', onSubmit = null, footer = true } = {}) {
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-overlay"><section class="modal ${wide?'modal-wide':''}" role="dialog" aria-modal="true"><header class="modal-header"><div><h2>${esc(title)}</h2><p>RuangStok · Wonder Merch</p></div><button class="modal-close" type="button" aria-label="Tutup">✕</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer"><button class="button button-ghost" type="button" data-modal-cancel>Batal</button><button class="button button-primary" type="submit" form="modal-form">${esc(submitText)}</button></footer>`:''}</section></div>`;
  const close=()=>{root.innerHTML='';};
  $('.modal-close',root).onclick=close;
  $('[data-modal-cancel]',root)?.addEventListener('click',close);
  $('.modal-overlay',root).addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay'))close();});
  const form=$('#modal-form',root);
  if(form&&onSubmit) form.addEventListener('submit',async e=>{e.preventDefault();const btn=$('.modal-footer button[type="submit"]',root);btn.disabled=true;try{await onSubmit(new FormData(form),form);close();}catch(err){btn.disabled=false;if(!err.wmToasted)toast(err.message||'Permintaan gagal.','error',err.detail||'');}});
  lucide.createIcons();
  return { root, close };
}
function confirmDialog(title, message, confirmText = 'Konfirmasi') {
  return new Promise(resolve=>{
    const {root,close}=modal(title,`<form id="modal-form"><p>${esc(message)}</p></form>`,{submitText:confirmText,onSubmit:async()=>resolve(true)});
    $('[data-modal-cancel]',root).onclick=()=>{close();resolve(false);};
    $('.modal-close',root).onclick=()=>{close();resolve(false);};
  });
}
function field(label, name, value = '', type = 'text', attrs = '') {
  return `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
}
function selectOptions(rows, valueKey, labelFn, selected = '', placeholder = 'Pilih...') {
  return `<option value="">${esc(placeholder)}</option>${rows.map(r=>`<option value="${esc(r[valueKey])}" ${String(selected)===String(r[valueKey])?'selected':''}>${esc(labelFn(r))}</option>`).join('')}`;
}
async function fileUpload(file, type) {
  if(!file) return null;
  const invoice=type==='invoice'; const allowed=invoice?['application/pdf','image/jpeg','image/png']:['image/jpeg','image/png'];
  const max=invoice?10:2;
  if(!allowed.includes(file.type)) throw new Error(`Format ${invoice?'invoice':'foto'} harus ${invoice?'PDF, JPG, JPEG, atau PNG':'JPG, JPEG, atau PNG'}.`);
  if(file.size>max*1024*1024) throw new Error(`Ukuran file maksimal ${max} MB.`);
  const data=new FormData();data.append('file',file);
  const result=await api(invoice?'/upload-invoice':'/upload-foto-produk',{method:'POST',body:data});
  return result;
}
async function refreshMasterData() {
  const [categories,sizes,products,suppliers]=await Promise.all([
    api('/kategori'),api('/ukuran?all=true'),fetchAllPages('/produk?status=all'),fetchAllPages('/supplier')
  ]);
  state.categories=categories;state.sizes=sizes;state.products=products;state.suppliers=suppliers;
}
async function fetchAllPages(url, limit=100) {
  const separator=url.includes('?')?'&':'?';
  const first=await api(`${url}${separator}page=1&limit=${limit}`);
  const pages=Math.ceil((first.total||0)/limit);
  if(pages<=1)return first.items||[];
  const rest=await Promise.all(Array.from({length:pages-1},(_,i)=>api(`${url}${separator}page=${i+2}&limit=${limit}`)));
  return [...(first.items||[]),...rest.flatMap(x=>x.items||[])];
}
function subcategories(parentId, includeInactive = false) {
  return state.categories.filter(c=>String(c.parent_id)===String(parentId)&& (includeInactive||c.status_aktif));
}
function productById(id) { return state.products.find(p=>String(p.id)===String(id)); }
function renderProductSelect(selected = '') {
  return `<option value="">Pilih produk</option>${state.products.filter(p=>p.status_aktif).map(p=>`<option value="${p.id}" ${String(selected)===String(p.id)?'selected':''}>${esc(p.sku)} · ${esc(p.nama)} (stok ${p.stok_saat_ini})</option>`).join('')}`;
}
function setupCategorySelects(root, selectedCategory = '', selectedSize = '', selectedParent = '') {
  const parent=$('[name="parent_id"]',root), sub=$('[name="kategori_id"]',root), size=$('[name="ukuran_id"]',root);
  if(!parent||!sub) return;
  const parents=state.categories.filter(c=>!c.parent_id&&c.status_aktif);
  const derivedParent=state.categories.find(x=>String(x.id)===String(selectedCategory))?.parent_id||'';
  parent.innerHTML=selectOptions(parents,'id',x=>x.nama,derivedParent||selectedParent,'Pilih kategori induk');
  const drawSub=()=>{
    const options=subcategories(parent.value);
    sub.innerHTML=selectOptions(options,'id',x=>x.nama,selectedCategory,'Pilih sub-kategori');
    if(size) drawSize();
  };
  const drawSize=()=>{
    const category=state.categories.find(c=>String(c.id)===String(sub.value));
    if(!size) return;
    const options=state.sizes.filter(x=>String(x.kategori_id)===String(sub.value)&&x.status_aktif);
    size.disabled=!category||!category.butuh_ukuran;
    size.required=Boolean(category?.butuh_ukuran);
    size.innerHTML=category?.butuh_ukuran?selectOptions(options,'id',x=>x.nilai,selectedSize,'Pilih ukuran'):'<option value="">Tidak menggunakan ukuran</option>';
  };
  parent.onchange=()=>{selectedCategory='';selectedSize='';drawSub();};
  sub.onchange=()=>{selectedSize='';drawSize();};
  drawSub();
}

function navigate(page) {
  if(!titles[page]) return;
  state.currentPage=page;
  $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));
  $('#page-title').textContent=titles[page];
  $('#sidebar').classList.remove('mobile-open');$('#mobile-shade').classList.remove('visible');
  window.scrollTo({top:0,behavior:'smooth'});
  const loaders={dashboard:loadDashboard,produk:loadProducts,supplier:loadSuppliers,'barang-masuk':loadPurchases,'barang-keluar':loadOutgoing,'kartu-persediaan':loadStock,'analisis-hpp':loadAnalysis,settings:loadSettings};
  loaders[page]?.();
  lucide.createIcons();
}
function renderKpis(target, items) {
  $(target).innerHTML=items.map(item=>`<div class="kpi"><div class="kpi-top"><span class="kpi-label-row"><span>${esc(item.label)}</span>${item.help?`<button class="kpi-help" type="button" data-tooltip="${esc(item.help)}" aria-label="Cara menghitung ${esc(item.label)}">!</button>`:''}</span><span class="kpi-icon"><i data-lucide="${item.icon}"></i></span></div><div class="kpi-value">${esc(item.value)}</div><div class="kpi-caption">${esc(item.caption||'')}</div></div>`).join('');
  lucide.createIcons();
}
function updateChart(key, id, config) {
  if(state.charts[key]) state.charts[key].destroy();
  const canvas=id.startsWith('#')?$(id):document.getElementById(id);
  if(!canvas) throw new Error(`Elemen grafik "${id}" tidak ditemukan.`);
  state.charts[key]=new Chart(canvas,config);
}
async function loadDashboard() {
  const period=$('#dashboard-period').value;
  const d=await api(`/dashboard?periode=${encodeURIComponent(period)}`);
  const k=d.kpi;
  renderKpis('#dashboard-kpis',[
    {label:'Omzet periode',value:money(k.omzet),icon:'banknote'},
    {label:'Laba kotor',value:money(k.laba_kotor),icon:'trending-up'},
    {label:'Margin laba',value:pct(k.margin),icon:'percent'},
    {label:'Produk aktif',value:number.format(k.jumlah_produk),icon:'package'},
    {label:'Unit persediaan',value:number.format(k.total_unit),icon:'boxes'},
    {label:'Nilai persediaan',value:money(k.nilai_persediaan),icon:'wallet'}
  ]);
  const alerts=[
    ['stok_minimum','Stok minimum','Produk sudah mencapai atau di bawah batas stok.','triangle-alert'],
    ['dead_stock','Dead stock','Tidak ada pergerakan keluar melewati ambang hari.','clock-3'],
    ['slow_moving','Slow-moving','Pergerakan produk melambat.','timer']
  ];
  $('#dashboard-alerts').innerHTML=alerts.map(([key,title,copy,icon])=>`<div class="alert-row" role="button" tabindex="0" data-alert="${key}"><span class="alert-icon"><i data-lucide="${icon}"></i></span><span class="alert-copy"><strong>${title}</strong><small>${copy}</small></span><span class="alert-count">${d.alert[key].length}</span></div>`).join('');
  $('#dashboard-alerts').onclick=e=>{const row=e.target.closest('[data-alert]');if(row){if(row.dataset.alert==='stok_minimum'){navigate('produk');$('#product-stock-filter').value='true';loadProducts();}else navigate('analisis-hpp');}};
  $('#dashboard-alerts').onkeydown=e=>{if(e.key==='Enter') e.target.click();};
  const group=$('#pie-mode').value;
  let pie=d.pie||[];
  if(group==='parent'){
    await refreshMasterData();
    const parentNames=new Map(state.categories.filter(c=>!c.parent_id).map(c=>[c.id,c.nama]));
    const totals={};d.pie.forEach(x=>{const cat=state.categories.find(c=>c.nama===x.nama);const name=cat?parentNames.get(cat.parent_id)||cat.nama:x.nama;totals[name]=(totals[name]||0)+Number(x.nilai);});
    pie=Object.entries(totals).map(([nama,nilai])=>({nama,nilai}));
  }
  if(pie.length>8) {
    pie.sort((a,b)=>Number(b.nilai)-Number(a.nilai));
    const small=pie.slice(7).reduce((sum,x)=>sum+Number(x.nilai),0);
    pie=[...pie.slice(0,7),{nama:'Lainnya',nilai:small}];
  }
  const total=pie.reduce((a,x)=>a+Number(x.nilai),0);
  $('#chart-empty').classList.toggle('hidden',total>0);
  if(total>0) updateChart('inventory','inventory-chart',{type:'doughnut',data:{labels:pie.map(x=>x.nama),datasets:[{data:pie.map(x=>Number(x.nilai)),backgroundColor:['#0f766e','#2563a6','#14b8a6','#64748b','#38bdf8','#94a3b8','#1e3a5f','#5eead4','#cbd5e1'],borderWidth:2,borderColor:getComputedStyle(document.documentElement).getPropertyValue('--surface')}]},options:{maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{usePointStyle:true,boxWidth:8,font:{size:10}}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${money(ctx.raw)} (${total?((ctx.raw/total)*100).toFixed(1):0}%)`}}}}});
  else if(state.charts.inventory){state.charts.inventory.destroy();delete state.charts.inventory;}
  const purchaseRows=(d.pembelian_terbaru||[]).map(x=>`<tr><td><span class="primary-cell">${esc(x.nomor_transaksi)}</span><span class="secondary-cell">${formatDate(x.tanggal)}</span></td><td>${esc(x.supplier?.nama||'—')}</td><td>${money(x.total_biaya_perolehan)}</td></tr>`);
  $('#recent-purchases').innerHTML=table(['Transaksi','Supplier','Total'],purchaseRows,'Belum ada transaksi barang masuk.','Tambahkan pembelian untuk melihat ringkasan.');
  const salesRows=(d.penjualan_terbaru||[]).map(x=>`<tr><td><span class="primary-cell">${esc(x.nomor_transaksi)}</span><span class="secondary-cell">${formatDate(x.tanggal)}</span></td><td>${esc(x.channel||'—')}</td><td>${money(x.total_penjualan)}</td></tr>`);
  $('#recent-sales').innerHTML=table(['Transaksi','Channel','Omzet'],salesRows,'Belum ada transaksi penjualan.','Catat penjualan untuk melihat ringkasan.');
  const topRows=(d.top_produk||[]).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.sku)}</td><td>${esc(x.nama)}</td><td>${qtyFmt(x.stok_saat_ini)}</td><td class="${x.profit<0?'warning-text':''}">${money(x.profit)}</td></tr>`);
  $('#top-products').innerHTML=table(['#','SKU','Produk','Stok','Laba kotor'],topRows,'Belum ada data produk.','Transaksi penjualan akan menghasilkan kontribusi laba.');
  lucide.createIcons();
}

function imageMarkup(path) {
  if(!path) return '<span class="thumb-placeholder"><i data-lucide="image"></i></span>';
  const url=publicStorageUrl('produk-images',path);
  return `<img class="product-thumb" alt="Foto produk" src="${url}" onerror="this.style.visibility='hidden'">`;
}
function productRows(rows) {
  return rows.map(p=>{
    const low=p.stok_saat_ini<=p.stok_minimum;
    return `<tr><td><input type="checkbox" data-product-check value="${p.id}" aria-label="Pilih ${esc(p.nama)}"></td><td>${imageMarkup(p.foto_path)}</td><td><span class="primary-cell">${esc(p.sku)}</span></td><td><span class="primary-cell">${esc(p.nama)}</span><span class="secondary-cell">${esc(p.satuan||'')}</span></td><td>${esc(p.kategori?.parent_id?state.categories.find(c=>c.id===p.kategori.parent_id)?.nama||'—':'—')}</td><td>${esc(p.kategori?.nama||'—')}</td><td>${esc(p.ukuran?.nilai||'—')}</td><td><span class="${low?'warning-text':''}">${qtyFmt(p.stok_saat_ini)}</span></td><td>${money(p.hpp)}</td><td>${money(Number(p.stok_saat_ini)*Number(p.hpp))}</td><td>${pct(p.margin_target)}</td><td>${money(p.harga_jual)}</td><td>${qtyFmt(p.stok_minimum)}</td><td><span class="badge ${p.status_aktif?'badge-success':'badge-neutral'}">${p.status_aktif?'Aktif':'Nonaktif'}</span></td><td><div class="row-actions product-actions"><button class="small-icon-btn" title="Lihat detail produk" aria-label="Lihat detail produk" data-product-detail="${p.id}"><i data-lucide="eye"></i><span>Detail</span></button><button class="small-icon-btn" title="Edit produk" aria-label="Edit produk" data-product-edit="${p.id}"><i data-lucide="pencil"></i><span>Edit</span></button><button class="small-icon-btn" title="${p.status_aktif?'Nonaktifkan produk':'Aktifkan produk'}" aria-label="${p.status_aktif?'Nonaktifkan produk':'Aktifkan produk'}" data-product-toggle="${p.id}"><i data-lucide="${p.status_aktif?'ban':'circle-check'}"></i><span>${p.status_aktif?'Nonaktifkan':'Aktifkan'}</span></button></div></td></tr>`;
  });
}
async function loadProducts() {
  try {
    await refreshMasterData();
    const params=new URLSearchParams({page:state.productPage,limit:20,search:$('#product-search').value,status:$('#product-status-filter').value});
    if($('#product-category-filter').value) params.set('kategori_id',$('#product-category-filter').value);
    if($('#product-stock-filter').value) params.set('stok_minimum','true');
    const [response,review]=await Promise.all([api(`/produk?${params}`),api(`/produk/margin-review?ignored=${state.ignoredReviews.join(',')}`)]);
    $('#product-category-filter').innerHTML=`<option value="">Semua kategori</option>${state.categories.filter(x=>!x.parent_id&&x.status_aktif).map(x=>`<option value="${x.id}">${esc(x.nama)}</option>`).join('')}`;
    $('#product-category-filter').value=params.get('kategori_id')||'';
    $('#product-table').innerHTML=table(['Pilih','Foto','SKU','Nama Produk','Kategori','Sub-kategori','Ukuran','Stok','HPP rata-rata','Nilai persediaan','Margin target','Harga jual','Min. stok','Status','Aksi'],productRows(response.items),'Belum ada produk.','Mulai dengan menambahkan produk pertama.','product-add');
    pager('#product-pagination',response.page,response.total,response.limit);
    if(review.length) {
      const row=review.slice(0,3).map(p=>`<tr><td>${esc(p.sku)}</td><td>${esc(p.nama)}</td><td>${pct(p.margin_aktual_indikatif)}</td><td>${pct(p.margin_target)}</td><td>${p.alerts.map(a=>a==='hpp_berubah'?'HPP berubah':a==='margin_rendah'?'Margin <15%':'Di bawah target').join(', ')}</td></tr>`);
      // The review is surfaced in the dedicated modal; this keeps the product table uncluttered.
    }
    $('#product-table').onclick=handleProductTable;
    $('#product-table').querySelectorAll('[data-action="product-add"]').forEach(b=>b.onclick=openProductForm);
    lucide.createIcons();
  } catch(error) {}
}
async function handleProductTable(e) {
  const detail=e.target.closest('[data-product-detail]');const edit=e.target.closest('[data-product-edit]');const toggle=e.target.closest('[data-product-toggle]');
  if(detail) showProductDetail(detail.dataset.productDetail);
  if(edit) openProductForm(Number(edit.dataset.productEdit));
  if(toggle) {
    const p=productById(toggle.dataset.productToggle);const active=!p.status_aktif;
    const note=active
      ?`Aktifkan kembali ${p.nama}? Produk akan tersedia untuk transaksi Barang Masuk dan Barang Keluar.`
      :`Nonaktifkan ${p.nama}? Produk tidak dapat dipilih pada transaksi baru. Stok dan riwayat lama tetap tersimpan. Anda dapat mengaktifkannya lagi melalui filter status "Semua status".`;
    if(!await confirmDialog(active?'Aktifkan produk':'Nonaktifkan produk',note,active?'Aktifkan':'Nonaktifkan')) return;
    await guarded(()=>apiPut(`/produk/${p.id}`,{status_aktif:active}),{success:`Produk ${active?'diaktifkan':'dinonaktifkan'}.`});await loadProducts();
  }
}
async function showProductDetail(id) {
  try {
    const p=await api(`/produk/${id}`);
    modal(`Detail produk · ${p.sku}`,`<div class="modal-form-grid"><div><small>Nama produk</small><p><strong>${esc(p.nama)}</strong></p></div><div><small>SKU otomatis</small><p>${esc(p.sku)}</p></div><div><small>Kategori / sub-kategori</small><p>${esc(state.categories.find(x=>x.id===p.kategori?.parent_id)?.nama||'—')} / ${esc(p.kategori?.nama||'—')}</p></div><div><small>Ukuran / satuan</small><p>${esc(p.ukuran?.nilai||'Tanpa ukuran')} · ${esc(p.satuan)}</p></div><div><small>Stok saat ini</small><p>${qtyFmt(p.stok_saat_ini)}</p></div><div><small>HPP rata-rata</small><p>${money(p.hpp)}</p></div><div><small>Nilai persediaan</small><p>${money(p.hpp*p.stok_saat_ini)}</p></div><div><small>Harga jual / margin target</small><p>${money(p.harga_jual)} / ${pct(p.margin_target)}</p></div></div>`,{footer:false});
  } catch(error) { toast(error.message,'error'); }
}
async function openProductForm(id=null,draft=null,onSaved=null) {
  await refreshMasterData();
  const p=id?await api(`/produk/${id}`):Object.assign({},draft||{});
  const {root}=modal(id?'Edit produk':'Tambah produk',`<form id="modal-form"><div class="modal-form-grid">
    ${field('Nama produk','nama',p.nama||'','text','required')}
    <label>Kategori induk<select name="parent_id" required></select></label>
    <label>Sub-kategori<select name="kategori_id" required></select></label>
    <label>Ukuran<select name="ukuran_id"></select></label>
    ${field('Satuan','satuan',p.satuan||'pcs','text','required')}
    ${field('Stok minimum','stok_minimum',p.stok_minimum??0,'number','min="0" step="1" required')}
    <label class="span-2 upload-field upload-product-photo">Upload foto produk (JPG/PNG, maks. 2 MB)<input id="product-photo-file" type="file" accept="image/jpeg,image/png"><span id="photo-preview" class="upload-preview"></span></label>
    <div class="form-note span-2">SKU dibuat otomatis. HPP tidak diisi di sini: sistem menghitung HPP rata-rata dari harga beli dan biaya tambahan pada transaksi Barang Masuk. Jika margin target diisi dan harga jual dibiarkan Rp0, harga jual awal dihitung otomatis setelah pembelian pertama.</div>
    <label>HPP rata-rata saat ini <input value="${Number(p.hpp)>0?esc(money(p.hpp)):'Belum ada pembelian'}" readonly></label>
    ${field('Margin target (%)','margin_target',p.margin_target??0,'number','min="0" max="99.99" step="0.01"')}
    <div class="form-note span-2">Margin target adalah sasaran untuk menyarankan harga jual: harga jual = HPP ÷ (1 − target margin). Analisis HPP menampilkan margin aktual transaksi dari harga yang benar-benar dijual dan HPP snapshot, jadi nilainya dapat berbeda.</div>
    ${field('Harga jual default (opsional)','harga_jual',p.harga_jual??0,'number','min="0" step="0.01" required')}
    <div class="button-row"><button type="button" class="button button-outline" id="calc-price" ${!p.hpp||!p.margin_target?'disabled':''}><i data-lucide="calculator"></i> Hitung Ulang dari Margin</button><button type="button" class="button button-soft" id="quick-category">+ Tambah kategori</button><button type="button" class="button button-soft" id="quick-size">+ Tambah ukuran</button></div>
  </div></form>`,{onSubmit:async(fd,form)=>{
      const body={nama:fd.get('nama'),kategori_id:Number(fd.get('kategori_id')),ukuran_id:fd.get('ukuran_id')?Number(fd.get('ukuran_id')):null,satuan:fd.get('satuan'),stok_minimum:Number(fd.get('stok_minimum')),margin_target:Number(fd.get('margin_target')),harga_jual:Number(fd.get('harga_jual')),foto_path:state.productPhotoPath};
      if(id&&Number(body.margin_target)!==Number(p.margin_target||0)) {
        const recalculate=await confirmDialog('Hitung ulang harga jual?', 'Margin target berubah. Apakah harga jual juga ingin dihitung ulang dari HPP saat ini?','Hitung ulang harga');
        if(recalculate&&Number(p.hpp)>0&&body.margin_target>0&&body.margin_target<100) {
          const calculated=await apiPost(`/produk/${id}/hitung-harga`,{margin_target:body.margin_target,update:false});
          body.harga_jual=Number(calculated.harga_jual);
        } else if(recalculate&&Number(p.hpp)<=0) {
          throw new Error('Tambahkan barang masuk dulu untuk auto-hitung.');
        }
      }
      await guarded(()=>id?apiPut(`/produk/${id}`,body):api('/produk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{success:`Produk berhasil ${id?'diperbarui':'ditambahkan'}.`});
      state.productPhotoPath=null;await loadProducts();await refreshMasterData();
      if(!id&&onSaved)setTimeout(()=>onSaved(),0);
    }});
  state.productPhotoPath=p.foto_path||null;
  setupCategorySelects(root,p.kategori_id||'',p.ukuran_id||'',p.parent_id||'');
  $('#photo-preview',root).innerHTML=p.foto_path?`<img class="upload-image-preview" alt="Pratinjau foto produk" src="${esc(publicStorageUrl('produk-images',p.foto_path))}">`: '';
  $('#product-photo-file',root).onchange=async e=>{
    try {
      const file=e.target.files[0]; if(!file)return;
      if(!['image/jpeg','image/png'].includes(file.type)||file.size>2*1024*1024) throw new Error('Pilih foto JPG/PNG maksimal 2 MB.');
      const data=await fileUpload(file,'product');state.productPhotoPath=data.path;
      $('#photo-preview',root).innerHTML=`<img class="upload-image-preview" alt="Pratinjau foto produk" src="${esc(data.url)}">`;
      toast('Foto produk berhasil diunggah.');
    }catch(error){toast(error.message,'error');e.target.value='';}
  };
  $('#calc-price',root).onclick=async()=>{
    try {
      const margin=Number($('[name="margin_target"]',root).value);
      const result=await apiPost(`/produk/${id||0}/hitung-harga`,{margin_target:margin,update:false});
      $('[name="harga_jual"]',root).value=Number(result.harga_jual).toFixed(2);
    }catch(error){toast(error.message,'error');}
  };
  $('#quick-category',root).onclick=()=>openCategoryForm(null,root);
  $('#quick-size',root).onclick=()=>openSizeForm(null,Number($('[name="kategori_id"]',root).value)||null,root);
  $$('[name="margin_target"],[name="harga_jual"]',root).forEach(el=>el.addEventListener('input',()=>{
    const margin=Number($('[name="margin_target"]',root).value);
    $('#calc-price',root).disabled=!(Number(p.hpp)>0&&margin>0&&margin<100);
  }));
  if(p.foto_path) state.productPhotoPath=p.foto_path;
  lucide.createIcons();
}
async function openBulkMargin() {
  const selected=$$('#product-table input[data-product-check]:checked').map(x=>Number(x.value));
  if(!selected.length){toast('Centang produk yang akan diperbarui.','info');return;}
  modal('Set Margin Massal',`<form id="modal-form">${field('Margin target (%)','margin_target','','number','min="0" max="99.99" step="0.01" required')}<div id="bulk-preview" class="return-result form-note">Masukkan margin untuk melihat preview harga jual.</div><input type="hidden" name="ids" value="${selected.join(',')}"></form>`,{submitText:'Terapkan perubahan',onSubmit:async(fd)=>{
    const margin=Number(fd.get('margin_target'));
    await guarded(()=>apiPost('/produk/bulk-set-margin',{ids:selected,margin_target:margin}),{success:'Margin produk terpilih berhasil diperbarui.'});
    loadProducts();
  }});
  // Add selection controls to the table while preserving the requested table columns.
  const input=$('#modal-form [name="margin_target"]');
  input.addEventListener('input',()=>{
    const margin=Number(input.value);
    $('#bulk-preview').innerHTML=selected.map(id=>{
      const p=productById(id);const price=p.hpp>0&&margin>0&&margin<100?p.hpp/(1-margin/100):null;
      return `<div class="margin-preview-row"><span>${esc(p.nama)} · ${esc(p.sku)}</span><span>${price===null?'HPP 0 — belum bisa dihitung':money(price)}</span><span>${price===null?'—':pct(margin)}</span></div>`;
    });
  });
}
async function openMarginReview() {
  const items=await api(`/produk/margin-review?ignored=${state.ignoredReviews.join(',')}`);
  const body=items.length?items.map(p=>`<div class="review-item"><i data-lucide="triangle-alert" class="review-warning"></i><div class="review-copy"><strong>${esc(p.nama)} · ${esc(p.sku)}</strong><small>HPP saat ditetapkan ${money(p.last_price_hpp)} · HPP kini ${money(p.hpp)} · Harga jual ${money(p.harga_jual)}</small><small>Margin transaksi ${p.margin_aktual_indikatif===null?'belum dievaluasi':pct(p.margin_aktual_indikatif)} (${qtyFmt(p.qty_terjual)} unit; minimum ${qtyFmt(p.minimal_qty_evaluasi)}) · Margin harga saat ini ${p.margin_harga_sekarang===null?'—':pct(p.margin_harga_sekarang)} · Target ${pct(p.margin_target)}</small><small>${p.alerts.map(a=>a==='hpp_berubah'?'HPP berubah >10%':a==='di_bawah_target'?'Margin transaksi di bawah target':'Margin transaksi <15%').join(', ')}</small></div><button class="button button-outline" data-review-edit="${p.id}">Edit Harga</button><button class="small-icon-btn" data-review-ignore="${p.id}" title="Abaikan"><i data-lucide="x"></i></button></div>`).join(''):emptyState('Tidak ada alert harga.','Margin produk aktif saat ini tidak memerlukan peninjauan.');
  const {root}=modal('Review harga & margin',body,{footer:false,wide:true});
  root.onclick=e=>{
    const edit=e.target.closest('[data-review-edit]');const ignore=e.target.closest('[data-review-ignore]');
    if(edit){root.innerHTML='';openProductForm(Number(edit.dataset.reviewEdit));}
    if(ignore){state.ignoredReviews.push(Number(ignore.dataset.reviewIgnore));localStorage.setItem('wm-ignored-reviews',JSON.stringify(state.ignoredReviews));ignore.closest('.review-item').remove();}
  };
}

function supplierRows(rows) {
  return rows.map(s=>`<tr><td><span class="primary-cell">${esc(s.nama)}</span><span class="secondary-cell">${esc(s.email||'')}</span></td><td>${esc(s.telepon||'—')}</td><td>${esc(s.alamat||'—')}</td><td><span class="badge ${s.status_aktif?'badge-success':'badge-neutral'}">${s.status_aktif?'Aktif':'Nonaktif'}</span></td><td>${formatDate(s.created_at?.slice(0,10))}</td><td><div class="row-actions"><button class="small-icon-btn" title="Lihat detail dan riwayat pembelian" aria-label="Lihat detail supplier" data-supplier-detail="${s.id}"><i data-lucide="eye"></i><span>Detail</span></button><button class="small-icon-btn" title="Edit supplier" aria-label="Edit supplier" data-supplier-edit="${s.id}"><i data-lucide="pencil"></i><span>Edit</span></button><button class="small-icon-btn" title="Nonaktifkan supplier" aria-label="Nonaktifkan supplier" data-supplier-remove="${s.id}"><i data-lucide="ban"></i><span>Nonaktifkan</span></button></div></td></tr>`);
}
async function loadSuppliers() {
  try {
    const p=new URLSearchParams({page:state.supplierPage,limit:20,search:$('#supplier-search').value,status:$('#supplier-status-filter').value});
    const data=await api(`/supplier?${p}`);
    $('#supplier-table').innerHTML=table(['Nama supplier','Telepon/HP','Alamat','Status','Dibuat','Aksi'],supplierRows(data.items),'Belum ada supplier.','Tambahkan supplier untuk mencatat pembelian.','supplier-add');
    pager('#supplier-pagination',data.page,data.total,data.limit);$('#supplier-table').onclick=handleSupplierTable;
    $('#supplier-table').querySelector('[data-action="supplier-add"]')?.addEventListener('click',()=>openSupplierForm());
    await refreshSupplierDropdown();lucide.createIcons();
  }catch(error){toast(error.message||'Daftar supplier gagal dimuat.','error');}
}
async function refreshSupplierDropdown() {
  const rows=await fetchAllPages('/supplier?status=aktif');
  state.suppliers=rows;
  const filter=$('#purchase-supplier-filter');
  if(filter) {
    const selected=filter.value;
    filter.innerHTML=`<option value="">Semua supplier</option>${state.suppliers.map(s=>`<option value="${s.id}">${esc(s.nama)}</option>`).join('')}`;
    filter.value=selected;
  }
}
async function handleSupplierTable(e) {
  const detail=e.target.closest('[data-supplier-detail]'),edit=e.target.closest('[data-supplier-edit]'),remove=e.target.closest('[data-supplier-remove]');
  if(detail) {
    try {
      const s=await api(`/supplier/${detail.dataset.supplierDetail}`);
      const rows=s.riwayat_pembelian.map(x=>`<tr><td>${esc(x.nomor_transaksi)}</td><td>${formatDate(x.tanggal)}</td><td>${money(x.total_biaya_perolehan)}</td><td><span class="badge ${x.status_transaksi==='posted'?'badge-success':'badge-neutral'}">${x.status_transaksi}</span></td></tr>`);
      modal(`Supplier · ${s.nama}`,`<div class="modal-form-grid"><div><small>Nama</small><p>${esc(s.nama)}</p></div><div><small>Email / Telepon</small><p>${esc(s.email||'—')} / ${esc(s.telepon||'—')}</p></div><div class="span-2"><small>Alamat</small><p>${esc(s.alamat||'—')}</p></div><div><small>Bank details</small><p>${esc(s.bank_details||'—')}</p></div><div><small>Notes</small><p>${esc(s.notes||'—')}</p></div><div><small>Total pembelian posted</small><p>${money(s.total_pembelian)}</p></div></div><h3>Riwayat pembelian</h3>${table(['Nomor transaksi','Tanggal','Total','Status'],rows,'Belum ada riwayat pembelian.','Transaksi pembelian supplier ini akan muncul di sini.')}`,{wide:true,footer:false});
    }catch(error){toast(error.message,'error');}
  }
  if(edit) openSupplierForm(Number(edit.dataset.supplierEdit));
  if(remove) {
    const s=state.suppliers.find(x=>String(x.id)===remove.dataset.supplierRemove);
    if(await confirmDialog('Nonaktifkan supplier',`Nonaktifkan supplier ${s?.nama||''}? Supplier yang sudah pernah digunakan tetap tersimpan.`,'Nonaktifkan')) {
      await guarded(()=>api(`/supplier/${remove.dataset.supplierRemove}`,{method:'DELETE'}),{success:'Supplier berhasil dinonaktifkan.'});loadSuppliers();
    }
  }
}
async function openSupplierForm(id=null) {
  const s=id?await api(`/supplier/${id}`):{};
  modal(id?'Edit supplier':'Tambah supplier',`<form id="modal-form"><div class="modal-form-grid">
    ${field('Nama *','nama',s.nama||'','text','required')}
    ${field('Alamat','alamat',s.alamat||'')}
    ${field('Email','email',s.email||'','email')}
    ${field('Nomor telepon/HP','telepon',s.telepon||'','tel')}
    <label class="span-2">Bank Details<textarea name="bank_details" rows="2">${esc(s.bank_details||'')}</textarea></label>
    <label class="span-2">Notes<textarea name="notes" rows="2">${esc(s.notes||'')}</textarea></label>
    ${id?`<label>Status aktif<select name="status_aktif"><option value="true" ${s.status_aktif?'selected':''}>Aktif</option><option value="false" ${!s.status_aktif?'selected':''}>Nonaktif</option></select></label>`:''}
    ${!id?'<div class="form-note span-2">Supplier baru otomatis berstatus aktif.</div>':''}
  </div></form>`,{onSubmit:async fd=>{
    const data={nama:fd.get('nama'),alamat:fd.get('alamat'),email:fd.get('email'),telepon:fd.get('telepon'),bank_details:fd.get('bank_details'),notes:fd.get('notes')};
    if(id)data.status_aktif=fd.get('status_aktif')==='true';
    await guarded(()=>id?apiPut(`/supplier/${id}`,data):apiPost('/supplier',data),{success:`Supplier berhasil ${id?'diperbarui':'ditambahkan'}.`});loadSuppliers();
  }});
}

async function loadPurchases() {
  try {
    await refreshMasterData();
    const p=new URLSearchParams({page:state.purchasePage,limit:20,search:$('#purchase-search').value});
    if($('#purchase-supplier-filter').value)p.set('supplier_id',$('#purchase-supplier-filter').value);
    if($('#purchase-from').value)p.set('tanggal_awal',$('#purchase-from').value);
    if($('#purchase-to').value)p.set('tanggal_akhir',$('#purchase-to').value);
    const data=await api(`/pembelian?${p}`);
    const rows=data.items.map(x=>`<tr><td><a class="record-link" data-purchase-detail="${x.id}">${esc(x.nomor_transaksi)}</a></td><td>${formatDate(x.tanggal)}</td><td>${esc(x.supplier?.nama||'—')}</td><td>${money(x.total_barang)}</td><td>${money(x.ongkir)}</td><td>${money(x.biaya_lain)}</td><td>${money(x.total_biaya_perolehan)}</td><td><span class="badge ${x.status_transaksi==='posted'?'badge-success':'badge-neutral'}">${x.status_transaksi}</span></td><td><div class="row-actions"><button class="small-icon-btn" data-purchase-detail="${x.id}" title="Lihat detail" aria-label="Lihat detail"><i data-lucide="eye"></i><span>Detail</span></button>${x.status_transaksi==='posted'?`<button class="small-icon-btn" data-purchase-void="${x.id}" title="Batalkan transaksi" aria-label="Batalkan transaksi"><i data-lucide="ban"></i><span>Batalkan</span></button>`:''}</div></td></tr>`);
    $('#purchase-table').innerHTML=table(['Nomor transaksi','Tanggal','Supplier','Total barang','Ongkir','Biaya lain','Biaya perolehan','Status','Aksi'],rows,'Belum ada transaksi barang masuk.','Catat pembelian barang pertama.','purchase-add');
    pager('#purchase-pagination',data.page,data.total,data.limit);
    $('#purchase-table').onclick=handlePurchaseTable;
    $('#purchase-table').querySelector('[data-action="purchase-add"]')?.addEventListener('click',openPurchaseForm);
    await refreshSupplierDropdown();lucide.createIcons();
  }catch(error){}
}
async function handlePurchaseTable(e) {
  const d=e.target.closest('[data-purchase-detail]'),v=e.target.closest('[data-purchase-void]');
  if(d) showPurchaseDetail(d.dataset.purchaseDetail);
  if(v) {
    const reason=await promptText('Alasan void pembelian','Alasan wajib dicatat.');
    if(reason===null)return;
    await guarded(()=>apiPost(`/pembelian/${v.dataset.purchaseVoid}/void`,{alasan:reason}),{showLoading:true,success:'Pembelian berhasil dibatalkan.'});
    loadPurchases();loadDashboard();
  }
}
function promptText(title, hint) {
  return new Promise(resolve=>{
    const {root,close}=modal(title,`<form id="modal-form"><label>${esc(hint)}<textarea name="alasan" rows="3" required></textarea></label></form>`,{submitText:'Lanjutkan',onSubmit:async(fd)=>resolve(fd.get('alasan').trim())});
    $('[data-modal-cancel]',root).onclick=()=>{close();resolve(null);};
    $('.modal-close',root).onclick=()=>{close();resolve(null);};
  });
}
async function showPurchaseDetail(id) {
  const h=await api(`/pembelian/${id}`);
  const rows=h.details.map(d=>`<tr><td>${esc(d.produk?.sku||'')}</td><td>${esc(d.produk?.nama||'')}</td><td>${qtyFmt(d.qty)}</td><td>${money(d.harga_beli_satuan)}</td><td>${money(d.subtotal)}</td><td>${money(d.alokasi_biaya)}</td><td>${money(d.biaya_perolehan_total)}</td><td>${money(d.biaya_perolehan_satuan)}</td></tr>`);
  const invoice=h.invoice_url?`<a class="file-link" href="${esc(h.invoice_url)}" target="_blank" rel="noopener"><i data-lucide="file-text"></i> Lihat invoice</a>`:'<p class="secondary-cell">Tidak ada file invoice.</p>';
  modal(`Barang masuk · ${h.nomor_transaksi}`,`<div class="modal-form-grid"><div><small>Supplier</small><p>${esc(h.supplier?.nama||'')}</p></div><div><small>Tanggal</small><p>${formatDate(h.tanggal)}</p></div><div><small>Biaya perolehan</small><p>${money(h.total_biaya_perolehan)}</p></div><div><small>Status</small><p>${esc(h.status_transaksi)}</p></div></div>${table(['SKU','Produk','Qty','Harga/unit','Subtotal','Alokasi','Biaya perolehan','Biaya/unit'],rows)}<h3>Invoice</h3>${invoice}`,{wide:true,footer:false});
}
async function openPurchaseForm(draft=null) {
  await refreshMasterData(); state.invoicePath=draft?.invoice_path||null;
  const activeSuppliers=await fetchAllPages('/supplier?status=aktif');
  if(!state.products.some(p=>p.status_aktif)) {toast('Tambahkan produk sebelum mencatat barang masuk.','info');navigate('produk');return;}
  if(!activeSuppliers.length){toast('Tambahkan supplier aktif sebelum mencatat barang masuk.','info');navigate('supplier');return;}
  const {root}=modal('Catat barang masuk',`<form id="modal-form">
    <div class="modal-form-grid">
      <label>Supplier *<select name="supplier_id" required>${selectOptions(activeSuppliers,'id',x=>x.nama)}</select></label>
      ${field('Tanggal *','tanggal',today(),'date','required')}
      ${field('Ongkir','ongkir','0','number','min="0" step="0.01"')}
      ${field('Biaya lain','biaya_lain','0','number','min="0" step="0.01"')}
      <label>Keterangan biaya lain<input name="keterangan_biaya_lain"></label>
      <label class="upload-field">Invoice (PDF/JPG/PNG, maks. 10 MB)<input id="invoice-file" type="file" accept="application/pdf,image/jpeg,image/png"><span id="invoice-preview" class="upload-preview"></span></label>
      <label class="span-2">Catatan<textarea name="catatan" rows="2"></textarea></label>
    </div>
    <div class="item-editor"><div class="item-editor-title"><span>Detail barang masuk</span><div class="button-row"><button class="button button-outline" type="button" id="purchase-add-product"><i data-lucide="package-plus"></i> Produk baru</button><button class="button button-soft" type="button" id="purchase-add-line"><i data-lucide="plus"></i> Tambah baris</button></div></div><div class="item-rows" id="purchase-lines"></div></div>
    <div id="purchase-warning" class="form-note warning hidden"></div>
    <div class="purchase-totals" id="purchase-totals"></div>
  </form>`,{wide:true,submitText:'Simpan barang masuk',onSubmit:async(fd)=>{
    const items=$$('#purchase-lines .item-row',root).map(row=>({produk_id:Number($('[name="produk_id"]',row).value),qty:Number($('[name="qty"]',row).value),harga_beli_satuan:Number($('[name="harga_beli_satuan"]',row).value)}));
    const zero=items.some(x=>x.harga_beli_satuan===0);
    if(zero&&!await confirmDialog('Pembelian gratis?', 'Harga beli Rp0 akan menghasilkan biaya perolehan nol untuk baris tersebut. Pastikan nilainya memang gratis.','Tetap simpan')) throw new Error('Transaksi dibatalkan.');
    const payload={supplier_id:Number(fd.get('supplier_id')),tanggal:fd.get('tanggal'),ongkir:Number(fd.get('ongkir')||0),biaya_lain:Number(fd.get('biaya_lain')||0),keterangan_biaya_lain:fd.get('keterangan_biaya_lain'),invoice_path:state.invoicePath,catatan:fd.get('catatan'),items};
    await guarded(()=>apiPost('/pembelian',payload),{showLoading:true,success:'Barang masuk berhasil disimpan.'});
    state.invoicePath=null;loadPurchases();loadDashboard();await refreshMasterData();
  }});
  const addLine=(item={})=>{const row=document.createElement('div');row.className='item-row';row.innerHTML=`<label>Produk<select name="produk_id" required>${renderProductSelect(item.produk_id||'')}</select></label><label>Qty<input name="qty" type="number" min="1" step="1" required value="${esc(item.qty||1)}"></label><label>Harga beli/unit<input name="harga_beli_satuan" type="number" min="0" step="0.01" required placeholder="Wajib diisi" value="${esc(item.harga_beli_satuan??'')}"></label><div><small>Perolehan/unit</small><div class="item-readonly line-unit-cost">Rp0</div></div><button type="button" class="line-remove" title="Hapus baris"><i data-lucide="trash-2"></i></button>`;$('#purchase-lines',root).append(row);row.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',updatePurchasePreview));row.querySelector('.line-remove').onclick=()=>{if($('#purchase-lines',root).children.length>1)row.remove();updatePurchasePreview();};lucide.createIcons();};
  $('#purchase-add-line',root).onclick=()=>addLine();
  if(draft){
    for(const key of ['supplier_id','tanggal','ongkir','biaya_lain','keterangan_biaya_lain','catatan']) {
      const input=$(`[name="${key}"]`,root);
      if(input&&draft[key]!==undefined)input.value=draft[key];
    }
    (draft.items?.length?draft.items:[{}]).forEach(addLine);
    if(state.invoicePath){
      const url=publicStorageUrl('invoices',state.invoicePath);
      $('#invoice-preview',root).innerHTML=`<span class="upload-file-status"><i data-lucide="file-check-2"></i> Invoice tersimpan</span><a class="file-link" href="${esc(url)}" target="_blank" rel="noopener">Lihat invoice</a>`;
      lucide.createIcons();
    }
  }else addLine();
  $('#purchase-add-product',root).onclick=()=>{
    const saved={
      supplier_id:$('[name="supplier_id"]',root).value,tanggal:$('[name="tanggal"]',root).value,
      ongkir:$('[name="ongkir"]',root).value,biaya_lain:$('[name="biaya_lain"]',root).value,
      keterangan_biaya_lain:$('[name="keterangan_biaya_lain"]',root).value,catatan:$('[name="catatan"]',root).value,
      invoice_path:state.invoicePath,
      items:$$('#purchase-lines .item-row',root).map(row=>({
        produk_id:$('[name="produk_id"]',row).value,qty:$('[name="qty"]',row).value,
        harga_beli_satuan:$('[name="harga_beli_satuan"]',row).value
      }))
    };
    $('#modal-root').innerHTML='';
    openProductForm(null,null,()=>openPurchaseForm(saved));
  };
  $('#invoice-file',root).onchange=async e=>{
    try{const f=e.target.files[0];if(!f)return;const r=await fileUpload(f,'invoice');state.invoicePath=r.path;$('#invoice-preview',root).innerHTML=`<span class="upload-file-status"><i data-lucide="file-check-2"></i> Invoice berhasil diunggah</span><a class="file-link" href="${esc(r.url)}" target="_blank" rel="noopener">Lihat invoice</a>`;lucide.createIcons();toast('Invoice berhasil diunggah.');}
    catch(error){state.invoicePath=null;e.target.value='';toast(error.message,'error');}
  };
  function updatePurchasePreview(){
    const rows=$$('#purchase-lines .item-row',root);const extra=Number($('[name="ongkir"]',root).value||0)+Number($('[name="biaya_lain"]',root).value||0);
    const items=rows.map(row=>{const qty=Number($('[name="qty"]',row).value||0),price=Number($('[name="harga_beli_satuan"]',row).value||0);return {row,qty,subtotal:qty*price};});
    const sum=items.reduce((a,x)=>a+x.subtotal,0);let allocated=0;
    items.forEach((x,i)=>{const alloc=extra===0?0:sum===0?0:i===items.length-1?extra-allocated:Math.round(extra*x.subtotal/sum*100)/100;if(i<items.length-1)allocated+=alloc;x.row.querySelector('.line-unit-cost').textContent=money(x.qty?(x.subtotal+alloc)/x.qty:0);});
    const warn=$('#purchase-warning',root);warn.classList.toggle('hidden',!(sum===0&&extra>0));warn.textContent='Biaya tambahan tidak dapat dialokasikan jika total subtotal barang nol.';
    $('#purchase-totals',root).innerHTML=[['Total barang',sum],['Biaya tambahan',extra],['Total biaya perolehan',sum+extra],['Alokasi terhitung',items.reduce((a,x)=>a+(sum?extra*x.subtotal/sum:0),0)]].map(x=>`<div class="total-box"><small>${x[0]}</small><strong>${money(x[1])}</strong></div>`).join('');
  }
  $$('[name="ongkir"],[name="biaya_lain"]',root).forEach(el=>el.addEventListener('input',updatePurchasePreview));
  updatePurchasePreview();
}

async function loadOutgoing() {
  try{
    const p=new URLSearchParams({page:state.outgoingPage,limit:20,search:$('#outgoing-search').value});
    if($('#outgoing-kind').value)p.set('jenis',$('#outgoing-kind').value);
    if($('#outgoing-from').value)p.set('tanggal_awal',$('#outgoing-from').value);
    if($('#outgoing-to').value)p.set('tanggal_akhir',$('#outgoing-to').value);
    const data=await api(`/penjualan?${p}`);
    const rows=data.items.map(x=>`<tr><td><a class="record-link" data-out-detail="${x.id}">${esc(x.nomor_transaksi)}</a></td><td>${formatDate(x.tanggal)}</td><td>${esc(x.penjualan_asal_id?'Barang pengganti':movementTypeLabel(x.jenis_transaksi))}</td><td>${esc(x.channel||'—')}</td><td>${money(x.total_penjualan)}</td><td><span class="badge ${x.status_transaksi==='posted'?'badge-success':'badge-neutral'}">${x.status_transaksi}</span></td><td><div class="row-actions"><button class="small-icon-btn" data-out-detail="${x.id}" title="Lihat detail transaksi" aria-label="Lihat detail"><i data-lucide="eye"></i><span>Detail</span></button>${x.jenis_transaksi==='penjualan'&&x.status_transaksi==='posted'&&!x.penjualan_asal_id?`<button class="small-icon-btn" data-print="${x.id}" title="Cetak nota" aria-label="Cetak nota"><i data-lucide="printer"></i><span>Nota</span></button><button class="small-icon-btn" data-start-return="${esc(x.nomor_transaksi)}" title="Tukar barang customer" aria-label="Tukar barang customer"><i data-lucide="repeat-2"></i><span>Tukar</span></button>`:''}${x.status_transaksi==='posted'&&x.jenis_transaksi!=='retur_penjualan'&&!x.penjualan_asal_id?`<button class="small-icon-btn" data-out-void="${x.id}" title="Batalkan transaksi" aria-label="Batalkan transaksi"><i data-lucide="ban"></i><span>Batalkan</span></button>`:''}</div></td></tr>`);
    $('#outgoing-table').innerHTML=table(['Nomor transaksi','Tanggal','Jenis','Channel','Total penjualan','Status','Aksi'],rows,'Belum ada transaksi barang keluar.','Catat penjualan atau pergerakan persediaan.');
    pager('#outgoing-pagination',data.page,data.total,data.limit);
    $('#outgoing-table').onclick=handleOutgoingTable;lucide.createIcons();
  }catch(error){}
}
async function handleOutgoingTable(e) {
  const det=e.target.closest('[data-out-detail]'),print=e.target.closest('[data-print]'),ret=e.target.closest('[data-start-return]'),voidButton=e.target.closest('[data-out-void]');
  if(det)showOutgoingDetail(det.dataset.outDetail);
  if(print)printReceipt(Number(print.dataset.print));
  if(ret){setOutgoingTab('penyesuaian');openInventoryMovementForm('tukar_customer',ret.dataset.startReturn);}
  if(voidButton){
    const reason=await promptText('Void transaksi','Alasan wajib dicatat. Stok akan dikembalikan jika integritas persediaan aman.');
    if(reason===null)return;
    await guarded(()=>apiPost(`/penjualan/${voidButton.dataset.outVoid}/void`,{alasan:reason}),{showLoading:true,success:'Transaksi berhasil dibatalkan.'});
    loadOutgoing();loadDashboard();loadStock();
  }
}
async function showOutgoingDetail(id) {
  const h=await api(`/penjualan/${id}`);
  const rows=h.details.map(d=>`<tr><td>${esc(d.produk?.sku||'')}</td><td>${esc(d.produk?.nama||'')}</td><td>${qtyFmt(d.qty)}</td><td>${money(d.harga_jual_satuan)}</td><td>${money(d.hpp_snapshot_satuan)}</td><td>${money(d.subtotal_penjualan)}</td><td>${money(d.laba_kotor)}</td></tr>`);
  modal(`Transaksi · ${h.nomor_transaksi}`,`<div class="modal-form-grid"><div><small>Jenis</small><p>${esc(h.jenis_transaksi)}</p></div><div><small>Tanggal</small><p>${formatDate(h.tanggal)}</p></div><div><small>Status</small><p>${esc(h.status_transaksi)}</p></div><div><small>Channel</small><p>${esc(h.channel||'—')}</p></div><div><small>Omzet / total</small><p>${money(h.total_penjualan)}</p></div><div><small>HPP / laba</small><p>${money(h.total_hpp)} / ${money(h.total_laba_kotor)}</p></div></div>${table(['SKU','Produk','Qty','Harga jual','HPP snapshot','Subtotal','Laba kotor'],rows)}`,{wide:true,footer:false});
}
function setOutgoingTab(tab) {
  state.outgoingTab=tab;
  $$('#outgoing-tabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $('#outgoing-kind').classList.toggle('hidden',tab==='penjualan');
  $('#outgoing-kind').value=tab==='penjualan'?'penjualan':'';
  $('#outgoing-add').innerHTML=tab==='penjualan'?'<i data-lucide="plus"></i> Catat Penjualan':'<i data-lucide="plus"></i> Catat Penyesuaian Stok';
  state.outgoingPage=1;
  lucide.createIcons();
  if(tab==='penyesuaian') loadAdjustments(); else loadOutgoing();
}
async function loadAdjustments() {
  try{
    const [adjustments,sales]=await Promise.all([
      fetchAllPages('/penyesuaian?limit=500'),
      fetchAllPages('/penjualan?limit=500')
    ]);
    const records=[
      ...adjustments.map(x=>({...x,record_type:'penyesuaian',jenis_transaksi:x.jenis,ringkasan:x.alasan,nilai:x.total_nilai})),
      ...sales.filter(x=>x.jenis_transaksi!=='penjualan').map(x=>({...x,record_type:'penjualan',ringkasan:x.alasan_retur||x.catatan||'',nilai:x.total_penjualan}))
    ].sort((a,b)=>String(b.tanggal).localeCompare(String(a.tanggal))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
    const search=$('#outgoing-search').value.trim().toLocaleLowerCase();
    const kindAliases={write_off_rusak:'barang_rusak',write_off_hilang:'barang_hilang'};
    const filtered=records.filter(x=>
      (!$('#outgoing-kind').value||x.jenis_transaksi===$('#outgoing-kind').value||kindAliases[$('#outgoing-kind').value]===x.jenis_transaksi)&&
      (!$('#outgoing-from').value||x.tanggal>=$('#outgoing-from').value)&&
      (!$('#outgoing-to').value||x.tanggal<=$('#outgoing-to').value)&&
      (!search||`${x.nomor_transaksi} ${x.ringkasan} ${x.jenis_transaksi}`.toLocaleLowerCase().includes(search))
    );
    const page=state.outgoingPage,limit=20,start=(page-1)*limit;
    const pageRows=filtered.slice(start,start+limit);
    const rows=pageRows.map(x=>`<tr><td><a class="record-link" data-inventory-detail="${x.id}" data-record-type="${x.record_type}">${esc(x.nomor_transaksi)}</a></td><td>${formatDate(x.tanggal)}</td><td>${esc(movementTypeLabel(x.jenis_transaksi))}</td><td>${esc(x.ringkasan||'—')}</td><td>${money(x.nilai)}</td><td><span class="badge ${x.status_transaksi==='posted'?'badge-success':'badge-neutral'}">${esc(x.status_transaksi)}</span></td><td><div class="row-actions"><button class="small-icon-btn" data-inventory-detail="${x.id}" data-record-type="${x.record_type}" title="Lihat detail pergerakan" aria-label="Lihat detail"><i data-lucide="eye"></i><span>Detail</span></button>${x.status_transaksi==='posted'&&!(x.record_type==='penjualan'&&x.jenis_transaksi==='retur_penjualan')?`<button class="small-icon-btn" data-inventory-void="${x.id}" data-record-type="${x.record_type}" title="Batalkan transaksi stok" aria-label="Batalkan transaksi"><i data-lucide="ban"></i><span>Batalkan</span></button>`:''}</div></td></tr>`);
    $('#outgoing-table').innerHTML=table(['Nomor transaksi','Tanggal','Jenis','Keterangan','Nilai','Status','Aksi'],rows,'Belum ada penyesuaian stok.','Retur, barang rusak/hilang, dan koreksi stok akan tampil di sini.');
    $('#outgoing-table').onclick=async e=>{
      const detail=e.target.closest('[data-inventory-detail]'),voidButton=e.target.closest('[data-inventory-void]');
      if(detail){
        const type=detail.dataset.recordType,id=detail.dataset.inventoryDetail;
        const h=await api(`/${type}/${id}`);
        if(type==='penyesuaian'){
          const detailRows=h.details.map(x=>`<tr><td>${esc(x.produk?.nama||'')}</td><td>${qtyFmt(x.qty)}</td><td>${money(x.hpp_snapshot_satuan)}</td><td>${money(x.nilai_total)}</td></tr>`);
          modal(`Penyesuaian · ${h.nomor_transaksi}`,`<p>${esc(h.alasan||h.jenis)}</p>${table(['Produk','Qty','HPP snapshot','Nilai'],detailRows)}`,{footer:false});
        }else{
          const detailRows=h.details.map(x=>`<tr><td>${esc(x.produk?.nama||'')}</td><td>${qtyFmt(x.qty)}</td><td>${money(x.harga_jual_satuan)}</td><td>${money(x.hpp_snapshot_satuan)}</td></tr>`);
          const original=h.penjualan_asal_id?await api(`/penjualan/asal/${h.penjualan_asal_id}`):null;
          modal(`Pergerakan stok · ${h.nomor_transaksi}`,`<div class="modal-form-grid"><div><small>Jenis</small><p>${esc(h.jenis_transaksi.replaceAll('_',' '))}</p></div><div><small>Tanggal</small><p>${formatDate(h.tanggal)}</p></div><div><small>Transaksi asal</small><p>${esc(original?.nomor_transaksi||'—')}</p></div><div><small>Kondisi</small><p>${esc(h.kondisi_barang||'—')}</p></div><div><small>Alasan / catatan</small><p>${esc(h.alasan_retur||h.catatan||'—')}</p></div><div><small>Status</small><p>${esc(h.status_transaksi)}</p></div></div>${table(['Produk','Qty','Harga jual asal','HPP snapshot'],detailRows)}`,{wide:true,footer:false});
        }
      }
      if(voidButton){
        const type=voidButton.dataset.recordType,id=voidButton.dataset.inventoryVoid;
        const reason=await promptText('Batalkan transaksi stok','Alasan pembatalan wajib diisi.');
        if(reason===null)return;
        const endpoint=type==='penjualan'?`/penjualan/${id}/void`:`/penyesuaian/${id}/void`;
        const body=type==='penjualan'?{alasan:reason}:{alasan:reason};
        await guarded(()=>apiPost(endpoint,body),{showLoading:true,success:'Transaksi berhasil dibatalkan.'});
        loadAdjustments();loadDashboard();loadStock();loadOutgoing();
      }
    };
    pager('#outgoing-pagination',page,filtered.length,limit);lucide.createIcons();
  }catch(error){toast(error.message||'Daftar penyesuaian stok gagal dimuat.','error');}
}
async function openOutgoingForm() {
  if(state.outgoingTab==='penyesuaian')return openInventoryMovementForm();
  await refreshMasterData();
  const isSale=true;
  const kind='penjualan';
  const {root}=modal('Catat penjualan',`<form id="modal-form">
    <div class="modal-form-grid">${field('Tanggal *','tanggal',today(),'date','required')}
      ${isSale?`${field('Channel','channel','','text','placeholder="Offline, Instagram, marketplace..."')}${field('Nomor referensi','no_referensi')}`:''}
      <label class="span-2">Catatan<textarea name="catatan" rows="2"></textarea></label></div>
    <div class="item-editor"><div class="item-editor-title"><span>Barang</span><button class="button button-soft" type="button" id="out-add-line"><i data-lucide="plus"></i> Tambah baris</button></div><div class="item-rows" id="out-lines"></div></div>
    <div id="sale-warning" class="form-note hidden"></div>
    <div id="sale-totals" class="purchase-totals"></div>
  </form>`,{wide:true,submitText:isSale?'Simpan penjualan':'Simpan barang keluar',onSubmit:async fd=>{
    const items=$$('#out-lines .item-row',root).map(row=>({produk_id:Number($('[name="produk_id"]',row).value),qty:Number($('[name="qty"]',row).value),...(isSale?{harga_jual_satuan:Number($('[name="harga_jual_satuan"]',row).value)}:{})}));
    if(isSale&&$('#sale-warning',root).dataset.confirm!=='yes') {
      const warnings=$$('#out-lines .item-row',root).map(r=>{const p=productById($('[name="produk_id"]',r).value),price=Number($('[name="harga_jual_satuan"]',r).value);return p&&price<p.hpp?'Harga jual di bawah HPP. Anda akan rugi.':p&&price>0&&((price-p.hpp)/price*100)<15?'Margin rendah. Periksa kembali harga jual.':'';}).filter(Boolean);
      if(warnings.length&&!await confirmDialog('Peringatan harga',warnings.join(' '),'Tetap lanjutkan'))throw new Error('Silakan sesuaikan harga jual sebelum menyimpan.');
    }
    const payload={jenis_transaksi:kind,tanggal:fd.get('tanggal'),channel:fd.get('channel'),no_referensi:fd.get('no_referensi'),catatan:fd.get('catatan'),items};
    await guarded(()=>apiPost('/penjualan',payload),{showLoading:true,success:'Transaksi barang keluar berhasil disimpan.'});
    loadOutgoing();loadDashboard();loadStock();await refreshMasterData();
  }});
  const addLine=()=>{
    const row=document.createElement('div');row.className=`item-row ${isSale?'sales-row':''}`;
    row.innerHTML=isSale?`<label>Produk<select name="produk_id" required>${renderProductSelect()}</select></label><label>Qty<input name="qty" type="number" min="1" step="1" required value="1"></label><div><small>HPP snapshot</small><div class="item-readonly hpp-preview">${money(0)}</div></div><label>Harga jual/unit<input name="harga_jual_satuan" type="number" min="0" step="0.01" required></label><div><small>Subtotal</small><div class="item-readonly subtotal-preview">${money(0)}</div></div><div><small>Laba kotor</small><div class="item-readonly profit-preview">${money(0)}</div></div><button type="button" class="line-remove"><i data-lucide="trash-2"></i></button>`:
      `<label>Produk<select name="produk_id" required>${renderProductSelect()}</select></label><label>Qty<input name="qty" type="number" min="1" step="1" required value="1"></label><div><small>Stok tersedia</small><div class="item-readonly stock-preview">—</div></div><button type="button" class="line-remove"><i data-lucide="trash-2"></i></button>`;
    $('#out-lines',root).append(row);
    row.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',updatePreview));
    row.querySelector('[name="produk_id"]').onchange=()=>{const p=productById(row.querySelector('[name="produk_id"]').value);if(isSale&&p)row.querySelector('[name="harga_jual_satuan"]').value=p.harga_jual;updatePreview();};
    row.querySelector('.line-remove').onclick=()=>{if($('#out-lines',root).children.length>1)row.remove();updatePreview();};
    lucide.createIcons();
  };
  const updatePreview=()=>{
    let subtotal=0,cost=0,warning='';
    $$('#out-lines .item-row',root).forEach(row=>{
      const p=productById($('[name="produk_id"]',row).value),q=Number($('[name="qty"]',row).value||0);
      if(!p)return;
      if(isSale){
        const price=Number($('[name="harga_jual_satuan"]',row).value||0),profit=q*(price-Number(p.hpp));
        row.querySelector('.hpp-preview').textContent=money(p.hpp);row.querySelector('.subtotal-preview').textContent=money(q*price);row.querySelector('.profit-preview').textContent=money(profit);
        subtotal+=q*price;cost+=q*Number(p.hpp);
        if(price<p.hpp)warning='Harga jual di bawah HPP. Anda akan rugi.';
        else if(price>0&&(price-p.hpp)/price*100<15)warning='Margin rendah. Periksa kembali harga jual.';
      }else row.querySelector('.stock-preview').textContent=qtyFmt(p.stok_saat_ini);
    });
    $('#sale-warning',root).classList.toggle('hidden',!warning);
    $('#sale-warning',root).className=`form-note ${warning.includes('rugi')?'danger':'warning'} ${warning?'':'hidden'}`;
    $('#sale-warning',root).textContent=warning;
    $('#sale-totals',root).innerHTML=isSale?[['Total penjualan',subtotal],['HPP',cost],['Laba kotor',subtotal-cost],['Margin',subtotal?(subtotal-cost)/subtotal*100:0]].map((x,i)=>`<div class="total-box"><small>${x[0]}</small><strong>${i===3?pct(x[1]):money(x[1])}</strong></div>`).join(''):'';
  };
  $('#out-add-line',root).onclick=addLine;addLine();
}
async function openInventoryMovementForm(initialType='write_off_rusak',initialReference='') {
  await refreshMasterData();
  const [sales,purchases]=await Promise.all([
    fetchAllPages('/penjualan?jenis=penjualan&status=posted&limit=500'),
    fetchAllPages('/pembelian?status=posted&limit=500')
  ]);
  const labels={
    tukar_customer:'Penukaran dari customer',retur_ke_supplier:'Retur ke supplier',
    write_off_rusak:'Barang rusak',write_off_hilang:'Barang hilang',
    write_off_kadaluarsa:'Barang kedaluwarsa',
    koreksi_kurang:'Koreksi stok kurang',koreksi_lebih:'Koreksi stok lebih'
  };
  const initial=Object.hasOwn(labels,initialType)?initialType:'write_off_rusak';
  const {root}=modal('Penyesuaian stok',`<form id="modal-form">
    <div class="modal-form-grid">
      <label>Jenis penyesuaian *<select name="movement_type" required>${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${value===initial?'selected':''}>${label}</option>`).join('')}</select></label>
      ${field('Tanggal *','tanggal',today(),'date','required')}
      <label class="span-2">Alasan / keterangan *<textarea name="alasan" rows="2" required placeholder="Jelaskan alasan retur atau perubahan stok"></textarea></label>
      <label class="span-2">Catatan tambahan<textarea name="catatan" rows="2"></textarea></label>
    </div>
    <div id="movement-context" class="return-result"></div>
  </form>`,{wide:true,submitText:'Simpan penyesuaian',onSubmit:async fd=>{
    const type=fd.get('movement_type');
    const items=(type==='tukar_customer'||type==='retur_ke_supplier'
      ?$$('#movement-context [data-movement-item]:checked',root)
      :$$('#movement-context [data-movement-product]',root))
      .map(input=>({produk_id:Number(input.value),qty:Number($(`[data-movement-qty="${input.value}"]`,root).value)}));
    if(!items.length)throw new Error('Pilih minimal satu produk dan isi jumlahnya.');
    const base={tanggal:fd.get('tanggal'),alasan:fd.get('alasan'),catatan:fd.get('catatan'),items};
    if(type==='tukar_customer') {
      const reference=$('[name="sale_reference"]',root).value;
      const replacements=$$('#movement-exchange-lines .exchange-row',root).map(row=>({
        produk_id:Number($('[name="produk_pengganti"]',row).value),
        qty:Number($('[name="qty_pengganti"]',row).value)
      }));
      const changedQty=items.reduce((sum,item)=>sum+item.qty,0);
      const replacementQty=replacements.reduce((sum,item)=>sum+item.qty,0);
      if(!reference)throw new Error('Pilih transaksi penjualan asal.');
      if(replacements.some(item=>!item.produk_id||!Number.isInteger(item.qty)||item.qty<1))throw new Error('Pilih produk pengganti dan jumlahnya.');
      if(changedQty!==replacementQty)throw new Error('Jumlah barang yang ditukar dan barang pengganti harus sama.');
      const summary=$('#exchange-summary',root);
      if(Number(summary.dataset.difference||0)!==0&&!$('[name="selisih_diselesaikan"]',root)?.checked)throw new Error('Konfirmasi terlebih dahulu bahwa selisih harga sudah diselesaikan.');
      await guarded(()=>apiPost('/penjualan/tukar',{
        ...base,nomor_transaksi_asal:reference,kondisi_barang:fd.get('kondisi_barang'),
        items_pengganti:replacements,selisih_diselesaikan:$('[name="selisih_diselesaikan"]',root)?.checked||false
      }),{showLoading:true,success:'Penukaran barang customer berhasil diproses.'});
    }else if(type==='retur_ke_supplier') {
      const reference=$('[name="purchase_reference"]',root).value;
      if(!reference)throw new Error('Pilih transaksi barang masuk asal.');
      await guarded(()=>apiPost('/penyesuaian',{...base,jenis:type,pembelian_asal_id:Number(reference)}),{showLoading:true,success:'Retur supplier berhasil diproses.'});
    }else if(type==='write_off_rusak'||type==='write_off_hilang') {
      const saleType=type==='write_off_rusak'?'barang_rusak':'barang_hilang';
      await guarded(()=>apiPost('/penjualan',{jenis_transaksi:saleType,tanggal:base.tanggal,catatan:`${base.alasan}${base.catatan?` · ${base.catatan}`:''}`,items}),{showLoading:true,success:`${labels[type]} berhasil dicatat.`});
    }else{
      await guarded(()=>apiPost('/penyesuaian',{...base,jenis:type}),{showLoading:true,success:`${labels[type]} berhasil dicatat.`});
    }
    loadAdjustments();loadOutgoing();loadDashboard();loadStock();await refreshMasterData();
  }});
  const context=$('#movement-context',root),typeSelect=$('[name="movement_type"]',root);
  const sourceOption=(row,extra='',value=row.id)=>`<option value="${esc(value)}">${esc(row.nomor_transaksi)} · ${formatDate(row.tanggal)}${extra}</option>`;
  function drawManualItems() {
    context.innerHTML=`<div class="item-editor"><div class="item-editor-title"><span>Produk dan jumlah *</span><button class="button button-soft" type="button" id="movement-add-line"><i data-lucide="plus"></i> Tambah produk</button></div><div id="movement-lines" class="item-rows"></div></div>`;
    const addLine=()=>{
      const row=document.createElement('div');row.className='item-row adjust-row';
      row.innerHTML=`<label>Produk *<select data-movement-product name="produk_id" required>${renderProductSelect()}</select></label><label>Jumlah *<input data-movement-qty name="qty" type="number" min="1" step="1" value="1" required></label><div><small>Stok saat ini</small><div class="item-readonly movement-stock">Pilih produk</div></div><button type="button" class="line-remove" title="Hapus produk"><i data-lucide="trash-2"></i></button>`;
      const select=row.querySelector('[name="produk_id"]');
      select.onchange=()=>{const product=productById(select.value);row.querySelector('.movement-stock').textContent=product?`${qtyFmt(product.stok_saat_ini)} unit tersedia`:'Pilih produk';};
      row.querySelector('.line-remove').onclick=()=>{if($('#movement-lines',root).children.length>1)row.remove();};
      $('#movement-lines',root).append(row);lucide.createIcons();
    };
    $('#movement-add-line',root).onclick=addLine;addLine();
  }
  async function drawReturnContext(type) {
    const isCustomer=type==='tukar_customer';
    const list=isCustomer?sales.filter(x=>x.status_transaksi==='posted'):purchases.filter(x=>x.status_transaksi==='posted');
    const selectName=isCustomer?'sale_reference':'purchase_reference';
    const title=isCustomer?'Pilih transaksi penjualan asal *':'Pilih transaksi barang masuk asal *';
    const options=list.map(row=>sourceOption(row,isCustomer?` · ${esc(row.channel||'Penjualan')}`:` · ${money(row.total_biaya_perolehan)}`,isCustomer?row.nomor_transaksi:row.id)).join('');
    context.innerHTML=`<div class="modal-form-grid"><label class="span-2">${title}<select name="${selectName}" required><option value="">Pilih nomor transaksi dari daftar</option>${options}</select></label>${isCustomer?'<label>Kondisi barang yang ditukar *<select name="kondisi_barang" required><option value="layak_jual">Masih layak dijual kembali</option><option value="tidak_layak_jual">Rusak / bercak, jangan tambah stok</option></select></label>':''}</div><div id="movement-source-info" class="form-note">${isCustomer?'Pilih transaksi penjualan untuk memulai penukaran. Batas waktu maksimal 2 hari.':'Pilih transaksi barang masuk untuk melihat produk yang dapat diretur.'}</div><div id="movement-source-items" class="return-result"></div>`;
    $('.modal-footer button[type="submit"]',root).disabled=true;
    const select=$(`[name="${selectName}"]`,context);
    select.onchange=async()=>{
      const id=select.value;
      $('#movement-source-items',context).innerHTML='';
      if(!id){$('.modal-footer button[type="submit"]',root).disabled=true;return;}
      try{
        const transaction=isCustomer
          ?await api(`/penjualan/referensi/${encodeURIComponent(id)}`)
          :await api(`/pembelian/referensi/${id}`);
        let details,valid=true;
        if(isCustomer){
          valid=transaction.bisa_ditukar;
          details=transaction.items.map(row=>({...row,qty_max:row.qty_tersisa,qty_original:row.qty}));
          $('#movement-source-info',context).className=`form-note ${valid?'':'danger'}`;
          $('#movement-source-info',context).innerHTML=`Transaksi <strong>${esc(transaction.nomor_transaksi)}</strong> · ${formatDate(transaction.tanggal)}. ${valid?`Penukaran diperbolehkan sampai 2 hari setelah pembelian (${transaction.hari_berlalu}/2 hari).`:`Batas penukaran 2 hari terlewati.`}`;
        }else{
          valid=transaction.status_transaksi==='posted';
          details=transaction.details.map(row=>({...row,qty_max:row.qty_tersisa,qty_original:row.qty,qty_diretur:row.qty_diretur,produk:{id:row.produk_id,nama:row.produk?.nama,sku:row.produk?.sku}}));
          $('#movement-source-info',context).className=`form-note ${valid?'':'danger'}`;
          $('#movement-source-info',context).innerHTML=`Pembelian <strong>${esc(transaction.nomor_transaksi)}</strong> · ${formatDate(transaction.tanggal)} · Supplier ${esc(transaction.supplier?.nama||'')}. Jumlah retur dibatasi jumlah pada pembelian.`;
        }
        const rows=details.map(row=>{
          const productId=row.produk_id;
          const max=Math.max(0,Number(row.qty_max)||0);
          return `<tr><td><input type="checkbox" data-movement-item value="${productId}" ${!valid||max===0?'disabled':''}></td><td>${esc(row.produk?.nama||'Produk')}<span class="secondary-cell">${esc(row.produk?.sku||'')}</span>${isCustomer&&row.produk?.ukuran?.nilai?`<span class="secondary-cell">Ukuran ${esc(row.produk.ukuran.nilai)}</span>`:''}</td><td>${qtyFmt(row.qty_original)}</td><td>${qtyFmt(row.qty_diretur||0)}</td><td>${qtyFmt(max)}</td><td><input data-movement-qty="${productId}" type="number" min="1" max="${max}" step="1" value="1" ${!valid||max===0||isCustomer?'disabled':''}></td></tr>`;
        });
        const headers=isCustomer?['Pilih','Produk terjual','Qty terjual','Sudah ditukar','Sisa','Qty tukar']:['Pilih','Produk pembelian','Qty pembelian','Sudah diretur','Sisa','Qty retur'];
        const sourceContent=table(headers,rows,isCustomer?'Tidak ada produk yang masih dapat ditukar.':'Tidak ada produk yang bisa diretur.','Transaksi ini tidak memiliki produk yang masih dapat diproses.');
        $('#movement-source-items',context).innerHTML=sourceContent;
        if(isCustomer&&valid&&details.some(row=>Number(row.qty_max)>0)){
            $('#movement-source-items',context).insertAdjacentHTML('beforeend',`<div class="exchange-editor"><div class="item-editor-title"><span>Produk yang diterima dari customer</span><label>Kondisi<select name="kondisi_barang"><option value="layak_jual">Layak jual kembali</option><option value="tidak_layak_jual">Rusak / bercak</option></select></label></div><div class="exchange-replacements"><div class="item-editor-title"><span>Produk pengganti · jumlah harus sama dengan barang ditukar</span><button type="button" class="button button-soft" id="exchange-add-line"><i data-lucide="plus"></i> Tambah produk</button></div><div id="movement-exchange-lines"></div></div><div id="exchange-summary" class="exchange-summary" data-difference="0">Pilih barang yang ditukar dan produk pengganti untuk menghitung selisih harga.</div><label class="exchange-confirm hidden"><input type="checkbox" name="selisih_diselesaikan"> Selisih harga sudah dibayar customer / dikembalikan toko</label></div>`);
          const addReplacement=()=>{
            const row=document.createElement('div');row.className='exchange-row';
            const choices=state.products.filter(p=>p.status_aktif&&Number(p.harga_jual)>0).map(p=>`<option value="${p.id}" data-price="${Number(p.harga_jual)||0}" data-stock="${Number(p.stok_saat_ini)||0}">${esc(p.sku)} · ${esc(p.nama)}${p.ukuran?.nilai?` · ${esc(p.ukuran.nilai)}`:''} · stok ${qtyFmt(p.stok_saat_ini)}</option>`).join('');
            row.innerHTML=`<label>Produk pengganti *<select name="produk_pengganti" required><option value="">Pilih produk</option>${choices}</select></label><label>Qty *<input name="qty_pengganti" type="number" min="1" step="1" value="1" required></label><span class="exchange-line-price">Pilih produk</span><button class="line-remove" type="button" title="Hapus produk"><i data-lucide="trash-2"></i></button>`;
            row.querySelector('[name="produk_pengganti"]').onchange=()=>{const opt=row.querySelector('select').selectedOptions[0];row.querySelector('.exchange-line-price').textContent=opt.value?`${money(opt.dataset.price)} / unit · ${qtyFmt(opt.dataset.stock)} stok`:'Pilih produk';updateExchangeSummary();};
            row.querySelector('[name="qty_pengganti"]').oninput=updateExchangeSummary;
            row.querySelector('.line-remove').onclick=()=>{if($('#movement-exchange-lines',context).children.length>1)row.remove();updateExchangeSummary();};
            $('#movement-exchange-lines',context).append(row);lucide.createIcons();
          };
          const updateExchangeSummary=()=>{
            const oldTotal=$$('#movement-source-items [data-movement-item]:checked',context).reduce((sum,checkbox)=>{
              const detail=details.find(item=>String(item.produk_id)===checkbox.value),qty=Number($(`[data-movement-qty="${checkbox.value}"]`,context).value||0);
              return sum+Math.round(qty*Number(detail?.harga_jual_satuan||0)*100)/100;
            },0);
            const newTotal=$$('#movement-exchange-lines .exchange-row',context).reduce((sum,row)=>{
              const select=$('[name="produk_pengganti"]',row),product=productById(select.value);
              return sum+(product?Math.round(Number(product.harga_jual||0)*Number($('[name="qty_pengganti"]',row).value||0)*100)/100:0);
            },0);
            const oldQty=$$('#movement-source-items [data-movement-item]:checked',context).reduce((sum,checkbox)=>sum+Number($(`[data-movement-qty="${checkbox.value}"]`,context).value||0),0);
            const newQty=$$('#movement-exchange-lines [name="qty_pengganti"]',context).reduce((sum,input)=>sum+Number(input.value||0),0);
            const difference=Math.round((newTotal-oldTotal)*100)/100;
            const summary=$('#exchange-summary',context);
            summary.dataset.difference=String(difference);
            summary.innerHTML=`<strong>Nilai barang ditukar:</strong> ${money(oldTotal)} <span>·</span> <strong>Nilai barang pengganti:</strong> ${money(newTotal)} <span>·</span> ${difference>0?`Customer membayar ${money(difference)}`:difference<0?`Toko mengembalikan ${money(Math.abs(difference))}`:'Tidak ada selisih harga'}<small>Jumlah ditukar: ${oldQty} · Pengganti: ${newQty} ${oldQty===newQty?'':'· jumlah harus sama'}</small>`;
            const confirmation=$('.exchange-confirm',context);
            confirmation.classList.toggle('hidden',difference===0);
            const settled=difference===0||$('[name="selisih_diselesaikan"]',context).checked;
            $('.modal-footer button[type="submit"]',root).disabled=!valid||oldQty===0||oldQty!==newQty||!$$('#movement-exchange-lines select',context).every(select=>select.value)||!settled;
          };
          $('#exchange-add-line',context).onclick=addReplacement;
          $('#movement-source-items',context).addEventListener('change',e=>{if(e.target.matches('[data-movement-item]')){const input=$(`[data-movement-qty="${e.target.value}"]`,context);input.disabled=!e.target.checked;updateExchangeSummary();}});
          $('#movement-source-items',context).addEventListener('input',e=>{if(e.target.matches('[data-movement-qty]'))updateExchangeSummary();});
          $('[name="selisih_diselesaikan"]',context).onchange=updateExchangeSummary;
          addReplacement();
          updateExchangeSummary();
        }
        if(!isCustomer)$('.modal-footer button[type="submit"]',root).disabled=!valid||!details.some(row=>Number(row.qty_max)>0);
      }catch(error){
        $('#movement-source-info',context).className='form-note danger';
        $('#movement-source-info',context).textContent=error.message||'Detail transaksi gagal dimuat.';
        $('.modal-footer button[type="submit"]',root).disabled=true;
      }
    };
    if(initialReference) {
      const row=list.find(x=>x.nomor_transaksi===initialReference);
      if(row){select.value=isCustomer?row.nomor_transaksi:String(row.id);await select.onchange();}
    }
  }
  async function drawContext() {
    $('.modal-footer button[type="submit"]',root).disabled=false;
    const type=typeSelect.value;
    if(type==='tukar_customer'||type==='retur_ke_supplier') await drawReturnContext(type);
    else drawManualItems();
    lucide.createIcons();
  }
  typeSelect.onchange=drawContext;
  await drawContext();
}

async function loadStock() {
  try{
    await refreshMasterData();
    const products=state.products;
    $('#stock-product').innerHTML=`<option value="">Pilih produk</option>${products.map(p=>`<option value="${p.id}">${esc(p.sku)} · ${esc(p.nama)}</option>`).join('')}`;
    const parents=state.categories.filter(c=>!c.parent_id&&c.status_aktif);
    $('#stock-category').innerHTML=`<option value="">Semua kategori</option>${parents.map(c=>`<option value="${c.id}">${esc(c.nama)}</option>`).join('')}`;
    const p=new URLSearchParams({page:state.stockPage,limit:20});
    if($('#stock-mode').value==='product'&&$('#stock-product').value)p.set('produk_id',$('#stock-product').value);
    if($('#stock-from').value)p.set('tanggal_awal',$('#stock-from').value);
    if($('#stock-to').value)p.set('tanggal_akhir',$('#stock-to').value);
    if($('#stock-kind').value)p.set('jenis',$('#stock-kind').value);
    if($('#stock-search').value)p.set('search',$('#stock-search').value);
    if($('#stock-category').value)p.set('kategori_id',$('#stock-category').value);
    const result=await api(`/kartu-persediaan?${p}`);
    const rows=result.items.map(x=>{
      const note=x.jenis==='penjualan'?`Barang keluar · ${x.keterangan||'Penjualan'}`:x.jenis==='pembelian'?'Barang masuk':x.jenis==='retur_penjualan'?`Barang diterima · ${x.keterangan||'Penukaran customer'}`:x.keterangan||'—';
      return `<tr><td>${formatDate(x.tanggal)}</td><td><a class="record-link" data-stock-detail="${esc(x.nomor_transaksi)}">${esc(x.nomor_transaksi)}</a></td><td>${esc(x.sku)}</td><td>${esc(x.nama_produk)}</td><td>${esc(x.kategori||'—')}</td><td><span class="badge badge-neutral">${esc(movementTypeLabel(x.jenis))}</span></td><td>${esc(note)}</td><td>${qtyFmt(x.qty_masuk)}</td><td>${money(x.nilai_masuk)}</td><td>${qtyFmt(x.qty_keluar)}</td><td>${money(x.hpp_keluar)}</td><td>${qtyFmt(x.saldo_qty)}</td><td>${money(x.hpp_rata_rata)}</td><td>${money(x.saldo_nilai)}</td><td>${x.invoice_path?`<button class="small-icon-btn" data-invoice-path="${esc(x.invoice_path)}" title="Lihat invoice" aria-label="Lihat invoice"><i data-lucide="file-text"></i><span>Invoice</span></button>`:'—'}</td></tr>`;
    });
    $('#stock-table').innerHTML=table(['Tanggal','Nomor transaksi','SKU','Nama produk','Kategori','Jenis','Keterangan','Qty masuk','Nilai masuk','Qty keluar','HPP keluar','Saldo qty','HPP rata-rata','Saldo nilai','Invoice'],rows,'Belum ada pergerakan persediaan.','Pilih periode atau produk lain.');
    pager('#stock-pagination',result.page,result.total,result.limit);
    $('#stock-table').onclick=async e=>{
      const inv=e.target.closest('[data-invoice-path]');const det=e.target.closest('[data-stock-detail]');
      if(inv){const u=await api(`/file-url?bucket=invoices&path=${encodeURIComponent(inv.dataset.invoicePath)}`);window.open(u.url,'_blank','noopener');}
      if(det){const h=await lookupTransaction(det.dataset.stockDetail);if(h)modal(`Transaksi · ${h.nomor_transaksi}`,`<pre>${esc(JSON.stringify(h,null,2))}</pre>`,{footer:false});}
    };
    lucide.createIcons();
  }catch(error){}
}
async function lookupTransaction(no) {
  try {
    let r=await api(`/pembelian?search=${encodeURIComponent(no)}&limit=1`);
    if(r.items[0])return await api(`/pembelian/${r.items[0].id}`);
    r=await api(`/penjualan?search=${encodeURIComponent(no)}&limit=1`);
    if(r.items[0])return await api(`/penjualan/${r.items[0].id}`);
    const a=await api('/penyesuaian?limit=100');
    const found=a.items.find(x=>x.nomor_transaksi===no);return found?await api(`/penyesuaian/${found.id}`):null;
  }catch(error){toast(error.message,'error');return null;}
}
async function stockExport() {
  const p=new URLSearchParams();
  if($('#stock-mode').value==='product'&&$('#stock-product').value)p.set('produk_id',$('#stock-product').value);
  if($('#stock-from').value)p.set('tanggal_awal',$('#stock-from').value);
  if($('#stock-to').value)p.set('tanggal_akhir',$('#stock-to').value);
  if($('#stock-category').value)p.set('kategori_id',$('#stock-category').value);
  if($('#stock-kind').value)p.set('jenis',$('#stock-kind').value);
  if($('#stock-search').value)p.set('search',$('#stock-search').value);
  try {
    const rows=await api(`/kartu-persediaan/export?${p}`);
    const columns=[
      ['Tanggal','tanggal'],['Nomor Transaksi','nomor_transaksi'],['SKU','sku'],['Nama Produk','nama_produk'],
      ['Kategori','kategori'],['Jenis','jenis'],['Keterangan','keterangan'],['Qty Masuk','qty_masuk'],
      ['Nilai Masuk','nilai_masuk'],['Qty Keluar','qty_keluar'],['HPP Keluar','hpp_keluar'],
      ['Saldo Qty','saldo_qty'],['HPP Rata-rata','hpp_rata_rata'],['Saldo Nilai','saldo_nilai']
    ];
    const csvCell=value=>{
      let text=String(value??'');
      if(/^[=+\-@]/.test(text))text=`'${text}`;
      return `"${text.replace(/"/g,'""')}"`;
    };
    const csv=[columns.map(([label])=>csvCell(label)).join(','),...rows.map(row=>columns.map(([,key])=>csvCell(row[key])).join(','))].join('\r\n');
    const blob=new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'});
    const link=document.createElement('a');
    link.href=URL.createObjectURL(blob);link.download='kartu-persediaan.csv';link.click();
    URL.revokeObjectURL(link.href);
  } catch(error) { toast(error.message||'Ekspor gagal.','error'); }
}

async function loadAnalysis() {
  try{
    const data=await api(`/analisis-hpp?periode=${encodeURIComponent($('#analysis-period').value)}`);
    const s=data.ringkasan;
    renderKpis('#analysis-kpis',[
      {label:'Omzet bersih',value:money(s.omzet_bersih),icon:'banknote',help:'Total penjualan pada periode terpilih dikurangi nilai barang yang ditukar/dikembalikan.'},
      {label:'HPP bersih',value:money(s.hpp_penjualan_bersih),icon:'package-check',help:'HPP snapshot barang yang terjual dikurangi HPP barang layak jual yang diterima kembali.'},
      {label:'Laba kotor',value:money(s.laba_kotor),icon:'trending-up',help:'Omzet bersih dikurangi HPP bersih. Kerugian barang rusak/hilang ditampilkan terpisah.'},
      {label:'Margin',value:pct(s.margin),icon:'percent',help:'Laba kotor ÷ omzet bersih × 100%. Mengukur laba terhadap omzet.'},
      {label:'Markup',value:pct(s.markup),icon:'chart-no-axes-combined',help:'Laba kotor ÷ HPP bersih × 100%. Mengukur laba terhadap biaya barang.'},
      {label:'Nilai persediaan',value:money(s.nilai_persediaan),icon:'wallet',help:'Snapshot stok saat ini dikalikan HPP rata-rata tiap produk; bukan hanya transaksi periode terpilih.'}
    ]);
    const rows=data.kontribusi_produk.map(x=>`<tr><td>${esc(x.produk?.sku||'')}</td><td>${esc(x.produk?.nama||'')}</td><td>${esc(x.produk?.kategori?.nama||'')}</td><td>${qtyFmt(x.qty)}</td><td>${money(x.omzet)}</td><td>${money(x.hpp)}</td><td>${money(x.laba)}</td><td>${pct(x.margin)}</td></tr>`);
    $('#analysis-products').innerHTML=table(['SKU','Produk','Sub-kategori','Qty terjual bersih','Omzet bersih','HPP bersih','Laba kotor','Margin'],rows,'Belum ada transaksi pada periode ini.','Laporan akan menampilkan penjualan bersih dan retur.');
    $('#analysis-review').innerHTML=data.evaluasi_margin.length?data.evaluasi_margin.slice(0,12).map(p=>`<div class="review-item"><i data-lucide="badge-alert" class="review-warning"></i><div class="review-copy"><strong>${esc(p.nama)} · ${esc(p.sku)}</strong><small>Margin aktual indikatif ${pct(p.margin_aktual_indikatif)} · target ${pct(p.margin_target)} · Harga ${money(p.harga_jual)}</small><small>Target dipakai untuk menyarankan harga; margin aktual memakai harga transaksi dan HPP snapshot.</small></div><button class="button button-outline" data-edit-product="${p.id}">Edit Harga</button></div>`).join(''):emptyState('Margin terkendali.','Belum ada produk yang terdeteksi di bawah target.');
    $('#analysis-review').onclick=e=>{const b=e.target.closest('[data-edit-product]');if(b)openProductForm(Number(b.dataset.editProduct));};
    $('#analysis-losses').innerHTML=Object.keys(data.kerugian).length?Object.entries(data.kerugian).map(([k,v])=>`<div class="alert-row"><span class="alert-icon"><i data-lucide="circle-minus"></i></span><span class="alert-copy"><strong>${esc(k.replaceAll('_',' '))}</strong></span><strong>${money(v)}</strong></div>`).join(''):'<div class="form-note">Tidak ada kerugian persediaan tercatat pada periode ini.</div>';
    await loadCategoryChart();
    await loadPeriodic();
    lucide.createIcons();
  }catch(error){}
}
async function loadCategoryChart() {
  const level=$('#analysis-group').value;
  const data=await api(`/analisis-hpp/performa-kategori?level=${level==='subkategori'?'subkategori':'induk'}`);
  const rows=Array.isArray(data)?data:Object.values(data);
  updateChart('category','category-chart',{type:'bar',data:{labels:rows.map(x=>x.nama),datasets:[{label:'Nilai persediaan',data:rows.map(x=>x.nilai_persediaan),backgroundColor:'#64b5f6',borderRadius:6}]},options:{maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.raw)}}},scales:{x:{ticks:{callback:v=>money(v),font:{size:9}}},y:{ticks:{font:{size:9}}}}}});
}
async function loadPeriodic() {
  const type=$('#periodic-type').value,year=$('#periodic-year').value;
  const data=await api(`/analisis-hpp/periodik?type=${type}&tahun=${year}`);
  const rows=data.map(x=>`<tr><td>${esc(x.label??x.tahun)}</td><td>${money(x.omzet)}</td><td>${money(x.hpp)}</td><td>${money(x.laba)}</td><td>${pct(x.margin)}</td>${type==='tahunan'?`<td>${pct(x.pertumbuhan_omzet)}</td><td>${pct(x.pertumbuhan_laba)}</td>`:''}</tr>`);
  $('#periodic-table').innerHTML=table(type==='tahunan'?['Tahun','Omzet','HPP','Laba','Margin','Pertumbuhan omzet','Pertumbuhan laba']:['Periode','Omzet bersih','HPP bersih','Laba kotor','Margin'],rows,'Belum ada data pada periode ini.','Periode tanpa transaksi ditampilkan sebagai nol.');
  updateChart('periodic','periodic-canvas',{type:'bar',data:{labels:data.map(x=>x.label??String(x.tahun)),datasets:[{label:'Omzet',data:data.map(x=>x.omzet),backgroundColor:'#2563a6',borderRadius:5},{label:'Laba kotor',data:data.map(x=>x.laba),backgroundColor:'#14b8a6',borderRadius:5}]},options:{maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:9}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${money(c.raw)}`}}},scales:{x:{ticks:{font:{size:9}}},y:{ticks:{callback:v=>money(v),font:{size:9}}}}}});
}

async function loadSettings() {
  try{
    await refreshMasterData();
    const settings=await api('/pengaturan');
    const general=$('#settings-general'),threshold=$('#settings-thresholds');
    $$('input[name]',general).forEach(input=>input.value=settings[input.name]?.value||'');
    $$('textarea[name]',general).forEach(input=>input.value=settings[input.name]?.value||'');
    $$('input[name]',threshold).forEach(input=>input.value=settings[input.name]?.value||'');
    renderCategories();renderSizes();
  }catch(error){}
}
function renderCategories() {
  const rows=state.categories.slice().sort((a,b)=>a.urutan-b.urutan).map(c=>{
    const parent=c.parent_id?state.categories.find(x=>x.id===c.parent_id):null;
    return `<tr><td><span class="primary-cell">${parent?'↳ ':''}${esc(c.nama)}</span></td><td>${esc(parent?.nama||'Kategori induk')}</td><td>${esc(c.kode)}</td><td>${c.butuh_ukuran?'Ya':'Tidak'}</td><td><span class="badge ${c.status_aktif?'badge-success':'badge-neutral'}">${c.status_aktif?'Aktif':'Nonaktif'}</span></td><td><div class="row-actions"><button class="small-icon-btn" title="Edit kategori" aria-label="Edit kategori" data-category-edit="${c.id}"><i data-lucide="pencil"></i><span>Edit</span></button><button class="small-icon-btn" title="${c.status_aktif?'Nonaktifkan':'Aktifkan'} kategori" aria-label="${c.status_aktif?'Nonaktifkan':'Aktifkan'} kategori" data-category-toggle="${c.id}"><i data-lucide="${c.status_aktif?'ban':'circle-check'}"></i><span>${c.status_aktif?'Nonaktifkan':'Aktifkan'}</span></button></div></td></tr>`;
  });
  $('#category-table').innerHTML=table(['Nama','Induk','Kode','Perlu ukuran','Status','Aksi'],rows,'Belum ada kategori.','Kategori awal disiapkan melalui schema database.');
  $('#category-table').onclick=async e=>{
    const edit=e.target.closest('[data-category-edit]'),toggle=e.target.closest('[data-category-toggle]');
    if(edit)openCategoryForm(Number(edit.dataset.categoryEdit));
    if(toggle){const c=state.categories.find(x=>x.id===Number(toggle.dataset.categoryToggle));await apiPut(`/kategori/${c.id}`,{status_aktif:!c.status_aktif});toast(`Kategori ${c.status_aktif?'dinonaktifkan':'diaktifkan'}.`);await refreshMasterData();renderCategories();}
  };
  lucide.createIcons();
}
function renderSizes() {
  const sub=state.categories.filter(c=>c.parent_id);
  $('#size-category-filter').innerHTML=selectOptions(sub,'id',x=>x.nama,sub[0]?.id||'','Semua sub-kategori');
  const cat=$('#size-category-filter').value;
  const rows=state.sizes.filter(s=>!cat||String(s.kategori_id)===String(cat)).map(s=>{
    const c=state.categories.find(x=>x.id===s.kategori_id);
    return `<tr><td>${esc(c?.nama||'—')}</td><td>${esc(s.nilai)}</td><td>${s.urutan}</td><td><span class="badge ${s.status_aktif?'badge-success':'badge-neutral'}">${s.status_aktif?'Aktif':'Nonaktif'}</span></td><td><div class="row-actions"><button class="small-icon-btn" title="Edit ukuran" aria-label="Edit ukuran" data-size-edit="${s.id}"><i data-lucide="pencil"></i></button><button class="small-icon-btn" title="${s.status_aktif?'Nonaktifkan':'Aktifkan'} ukuran" aria-label="${s.status_aktif?'Nonaktifkan':'Aktifkan'} ukuran" data-size-delete="${s.id}"><i data-lucide="${s.status_aktif?'ban':'circle-check'}"></i></button></div></td></tr>`;
  });
  $('#size-table').innerHTML=table(['Sub-kategori','Ukuran','Urutan','Status','Aksi'],rows,'Belum ada ukuran.','Tambah ukuran ke sub-kategori yang sesuai.');
  $('#size-table').onclick=async e=>{
    const edit=e.target.closest('[data-size-edit]'),del=e.target.closest('[data-size-delete]');
    if(edit)openSizeForm(Number(edit.dataset.sizeEdit));
    if(del){const s=state.sizes.find(x=>x.id===Number(del.dataset.sizeDelete));await apiPut(`/ukuran/${s.id}`,{status_aktif:!s.status_aktif});toast(`Ukuran ${s.status_aktif?'dinonaktifkan':'diaktifkan'}.`);await refreshMasterData();renderSizes();}
  };
  lucide.createIcons();
}
async function openCategoryForm(id=null,returnRoot=null) {
  const c=id?state.categories.find(x=>x.id===id):{};
  const productDraft=returnRoot?Object.fromEntries(new FormData($('#modal-form',returnRoot)).entries()):null;
  if(productDraft)productDraft.foto_path=state.productPhotoPath;
  const {root}=modal(id?'Edit kategori':'Tambah kategori',`<form id="modal-form"><div class="modal-form-grid">
    ${field('Nama kategori *','nama',c.nama||'','text','required')}
    ${field('Kode SKU *','kode',c.kode||'','text','required pattern="[A-Za-z0-9_-]+"')}
    <label>Kategori induk<select name="parent_id"><option value="">— Kategori induk —</option>${state.categories.filter(x=>!x.parent_id&&x.status_aktif).map(x=>`<option value="${x.id}" ${String(c.parent_id)===String(x.id)?'selected':''}>${esc(x.nama)}</option>`).join('')}</select></label>
    ${field('Urutan','urutan',c.urutan||0,'number','step="1"')}
    <label>Sub-kategori memerlukan ukuran<select name="butuh_ukuran"><option value="false">Tidak</option><option value="true" ${c.butuh_ukuran?'selected':''}>Ya</option></select></label>
    ${id?`<label>Status aktif<select name="status_aktif"><option value="true" ${c.status_aktif?'selected':''}>Aktif</option><option value="false" ${!c.status_aktif?'selected':''}>Nonaktif</option></select></label>`:''}
  </div></form>`,{onSubmit:async fd=>{
    const data={nama:fd.get('nama'),kode:fd.get('kode'),parent_id:fd.get('parent_id')?Number(fd.get('parent_id')):null,urutan:Number(fd.get('urutan')||0),butuh_ukuran:fd.get('butuh_ukuran')==='true'};
    let saved;
    if(id){data.status_aktif=fd.get('status_aktif')==='true';saved=await apiPut(`/kategori/${id}`,data);}else saved=await apiPost('/kategori',data);
    toast(`Kategori berhasil ${id?'diperbarui':'ditambahkan'}.`);await refreshMasterData();renderCategories();renderSizes();
    if(productDraft&&!id){
      if(saved.parent_id){productDraft.kategori_id=String(saved.id);productDraft.parent_id=String(saved.parent_id);}
      else productDraft.parent_id=String(saved.id);
      setTimeout(()=>openProductForm(null,productDraft),0);
    }
  }});
}
async function openSizeForm(id=null,categoryId=null,returnRoot=null) {
  const s=id?state.sizes.find(x=>x.id===id):{};
  const productDraft=returnRoot?Object.fromEntries(new FormData($('#modal-form',returnRoot)).entries()):null;
  if(productDraft)productDraft.foto_path=state.productPhotoPath;
  const subs=state.categories.filter(x=>x.parent_id&&x.status_aktif);
  const {root}=modal(id?'Edit ukuran':'Tambah ukuran',`<form id="modal-form"><div class="modal-form-grid">
    <label>Sub-kategori *<select name="kategori_id" required>${selectOptions(subs,'id',x=>x.nama,categoryId||s.kategori_id||'','Pilih sub-kategori')}</select></label>
    ${field('Ukuran *','nilai',s.nilai||'','text','required')}
    ${field('Urutan','urutan',s.urutan||0,'number','step="1"')}
    ${id?`<label>Status aktif<select name="status_aktif"><option value="true" ${s.status_aktif?'selected':''}>Aktif</option><option value="false" ${!s.status_aktif?'selected':''}>Nonaktif</option></select></label>`:''}
  </div></form>`,{onSubmit:async fd=>{
    const data={kategori_id:Number(fd.get('kategori_id')),nilai:fd.get('nilai'),urutan:Number(fd.get('urutan')||0)};
    let saved;
    if(id){data.status_aktif=fd.get('status_aktif')==='true';saved=await apiPut(`/ukuran/${id}`,data);}else saved=await apiPost('/ukuran',data);
    toast(`Ukuran berhasil ${id?'diperbarui':'ditambahkan'}.`);await refreshMasterData();renderSizes();
    if(productDraft&&!id){productDraft.kategori_id=String(saved.kategori_id);productDraft.ukuran_id=String(saved.id);setTimeout(()=>openProductForm(null,productDraft),0);}
  }});
}
async function printReceipt(id) {
  try{
    const [h,settings]=await Promise.all([api(`/penjualan/${id}`),api('/config/nota')]);
    const details=h.details.map(x=>`<tr><td>${esc(x.produk?.nama||'')}</td><td>${x.qty}</td><td>${money(x.harga_jual_satuan)}</td><td>${money(x.subtotal_penjualan)}</td></tr>`).join('');
    const ordinal=h.nomor_transaksi.split('-').at(-1);
    $('#nota-print').innerHTML=`<div class="nota-header"><h2>${esc(settings.nama_toko)}</h2><p>${esc(settings.alamat||'')}</p><p>${esc(settings.telepon||'')}</p></div><div class="nota-meta"><span>No: <strong>${esc(h.nomor_transaksi)}</strong></span><span>Urut: ${esc(ordinal)}</span><span>Tanggal: ${formatDate(h.tanggal)}</span><span>Channel: ${esc(h.channel||'—')}</span>${h.no_referensi?`<span>Referensi: ${esc(h.no_referensi)}</span>`:''}</div><table><thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>${details}</tbody></table><div class="nota-total"><span>Total</span><span>${money(h.total_penjualan)}</span></div><p>${esc(h.catatan||'')}</p><div id="nota-qr" class="qrcode-box"></div><div class="nota-footer">${esc(settings.footer)}</div>`;
    if(window.QRCode) new QRCode($('#nota-qr'),{text:h.nomor_transaksi,width:100,height:100,correctLevel:QRCode.CorrectLevel.M});
    window.print();
  }catch(error){toast(error.message,'error');}
}

const paletteColors={
  ocean:{accent:'#0f766e',strong:'#0b625b',secondary:'#274c77'},
  forest:{accent:'#347553',strong:'#245b3d',secondary:'#bf8341'},
  plum:{accent:'#79528f',strong:'#613c78',secondary:'#cf695d'}
};
function setDailyPaletteRecommendation() {
  const paletteByDay=['ocean','forest','plum','ocean','forest','plum','ocean'];
  const names={ocean:'Ocean',forest:'Forest',plum:'Plum'};
  const recommendation=paletteByDay[new Date().getDay()];
  $$('.palette-choice').forEach(button=>{
    const recommended=button.dataset.theme===recommendation;
    button.classList.toggle('today-recommended',recommended);
    button.title=`Palet ${names[button.dataset.theme]}${recommended?' · rekomendasi hari ini':''}`;
    button.setAttribute('aria-label',button.title);
  });
}
function applyTheme(theme, dark, accent='') {
  if(!paletteColors[theme])theme='ocean';
  const palette=paletteColors[theme];
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.dark=dark?'true':'false';
  document.documentElement.dataset.customAccent=accent?'true':'false';
  const color=accent||palette.accent;
  document.documentElement.style.setProperty('--accent',color);
  document.documentElement.style.setProperty('--palette-secondary',palette.secondary);
  document.documentElement.style.setProperty('--accent-soft',`color-mix(in srgb, ${color} 12%, var(--surface))`);
  document.documentElement.style.setProperty('--accent-strong',accent?color:palette.strong);
  $('#accent-color').value=color;
  $$('.palette-choice').forEach(button=>button.classList.toggle('active',!accent&&button.dataset.theme===theme));
  $('.custom-palette').classList.toggle('active',Boolean(accent));
  const mode=$('#theme-quick');
  if(mode){
    const nextMode=dark?'terang':'gelap';
    mode.innerHTML=`<i data-lucide="${dark?'sun':'moon'}" aria-hidden="true"></i>`;
    mode.title=`Beralih ke mode ${nextMode}`;
    mode.setAttribute('aria-label',`Beralih ke mode ${nextMode}`);
    lucide.createIcons();
  }
  localStorage.setItem('wm-theme',JSON.stringify({theme,dark:Boolean(dark),accent:accent||''}));
  if(state.charts.inventory&&state.currentPage==='dashboard')loadDashboard();
}

function wireEvents() {
  document.addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(go)navigate(go.dataset.go);});
  $$('.nav-link').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
  $('#mobile-menu').onclick=()=>{$('#sidebar').classList.add('mobile-open');$('#mobile-shade').classList.add('visible');};
  $('#mobile-shade').onclick=()=>{$('#sidebar').classList.remove('mobile-open');$('#mobile-shade').classList.remove('visible');};
  $('#collapse-sidebar').onclick=()=>document.body.classList.toggle('sidebar-collapsed');
  $('#theme-quick').onclick=()=>{const saved=JSON.parse(localStorage.getItem('wm-theme')||'{}');applyTheme(document.documentElement.dataset.theme,document.documentElement.dataset.dark!=='true',saved.accent||'');};
  $('#dashboard-period').onchange=loadDashboard;
  $('#pie-mode').onchange=loadDashboard;
  $('#product-add').onclick=()=>openProductForm();
  $('#bulk-margin-open').onclick=openBulkMargin;
  $('#margin-review-open').onclick=()=>openMarginReview().catch(e=>toast(e.message,'error'));
  $('#product-search').oninput=()=>debounce('product',()=>{state.productPage=1;loadProducts();});
  $('#product-category-filter').onchange=()=>{state.productPage=1;loadProducts();};
  $('#product-stock-filter').onchange=()=>{state.productPage=1;loadProducts();};
  $('#product-status-filter').onchange=()=>{state.productPage=1;loadProducts();};
  bindPager('#product-pagination',n=>state.productPage=n,loadProducts);
  $('#supplier-add').onclick=()=>openSupplierForm();
  $('#supplier-search').oninput=()=>debounce('supplier',()=>{state.supplierPage=1;loadSuppliers();});
  $('#supplier-status-filter').onchange=()=>{state.supplierPage=1;loadSuppliers();};
  bindPager('#supplier-pagination',n=>state.supplierPage=n,loadSuppliers);
  $('#purchase-add').onclick=openPurchaseForm;
  $('#purchase-search').oninput=()=>debounce('purchase',()=>{state.purchasePage=1;loadPurchases();});
  ['purchase-supplier-filter','purchase-from','purchase-to'].forEach(id=>$('#'+id).onchange=()=>{state.purchasePage=1;loadPurchases();});
  bindPager('#purchase-pagination',n=>state.purchasePage=n,loadPurchases);
  $('#outgoing-add').onclick=openOutgoingForm;
  $('#outgoing-kind').value='penjualan';
  $('#outgoing-kind').classList.add('hidden');
  $('#outgoing-add').innerHTML='<i data-lucide="plus"></i> Catat Penjualan';
  $('#outgoing-tabs').onclick=e=>{const tab=e.target.closest('[data-tab]');if(tab)setOutgoingTab(tab.dataset.tab);};
  $('#outgoing-search').oninput=()=>debounce('outgoing',()=>{state.outgoingPage=1;state.outgoingTab==='penyesuaian'?loadAdjustments():loadOutgoing();});
  ['outgoing-kind','outgoing-from','outgoing-to'].forEach(id=>$('#'+id).onchange=()=>{state.outgoingPage=1;state.outgoingTab==='penyesuaian'?loadAdjustments():loadOutgoing();});
  bindPager('#outgoing-pagination',n=>{state.outgoingPage=n;},()=>state.outgoingTab==='penyesuaian'?loadAdjustments():loadOutgoing());
  $('#stock-mode').onchange=()=>{$('#stock-product').classList.toggle('hidden',$('#stock-mode').value!=='product');state.stockPage=1;loadStock();};
  $('#stock-product').onchange=loadStock;
  ['stock-category','stock-from','stock-to','stock-kind'].forEach(id=>$('#'+id).onchange=()=>{state.stockPage=1;loadStock();});
  $('#stock-search').oninput=()=>debounce('stock',()=>{state.stockPage=1;loadStock();});
  $('#stock-export').onclick=stockExport;
  bindPager('#stock-pagination',n=>state.stockPage=n,loadStock);
  $('#analysis-period').onchange=loadAnalysis;
  $('#analysis-group').onchange=()=>loadCategoryChart().catch(e=>toast(e.message,'error'));
  $('#periodic-type').onchange=loadPeriodic;
  $('#periodic-year').onchange=loadPeriodic;
  $('#settings-general').onsubmit=async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);const body=Object.fromEntries(fd.entries());
    await guarded(()=>apiPut('/pengaturan',body),{showLoading:true,success:'Identitas toko berhasil disimpan.'});loadSettings();
  };
  $('#settings-thresholds').onsubmit=async e=>{
    e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget).entries());
    Object.keys(body).forEach(k=>body[k]=Number(body[k]));
    await guarded(()=>apiPut('/pengaturan',body),{showLoading:true,success:'Aturan retur dan persediaan berhasil disimpan.'});loadSettings();
  };
  $('#category-add').onclick=()=>openCategoryForm();
  $('#size-add').onclick=()=>openSizeForm();
  $('#size-category-filter').onchange=renderSizes;
  $$('.palette-choice').forEach(btn=>btn.onclick=()=>applyTheme(btn.dataset.theme,document.documentElement.dataset.dark==='true',''));
  $('#accent-color').oninput=e=>applyTheme(document.documentElement.dataset.theme,document.documentElement.dataset.dark==='true',e.target.value);
  $('#theme-save').onclick=()=>{const saved=JSON.parse(localStorage.getItem('wm-theme')||'{}');localStorage.setItem('wm-theme',JSON.stringify({...saved,theme:document.documentElement.dataset.theme||'ocean',dark:document.documentElement.dataset.dark==='true'}));toast('Tampilan berhasil disimpan.');};
  $('#theme-reset').onclick=()=>{localStorage.removeItem('wm-theme');applyTheme('ocean',false,'');toast('Tampilan dikembalikan ke default.');};
  $('#modal-root').addEventListener('click',e=>{
    const go=e.target.closest('[data-go]');if(go)navigate(go.dataset.go);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modal-root').innerHTML)$('#modal-root').innerHTML='';});
}

async function init() {
  const saved=JSON.parse(localStorage.getItem('wm-theme')||'{}');
  const savedTheme=paletteColors[saved.theme]?saved.theme:saved.theme==='blue'?'ocean':'ocean';
  const savedAccent=saved.accent||'';
  applyTheme(savedTheme,Boolean(saved.dark),savedAccent);
  setDailyPaletteRecommendation();
  wireEvents();
  lucide.createIcons();
  try{
    const health=await api('/health');
    if(health.supabase==='connected'){
      await refreshMasterData();
      $('#stock-kind').innerHTML=`<option value="">Semua jenis</option><option value="pembelian">Pembelian</option><option value="penjualan">Penjualan</option><option value="barang_rusak">Barang rusak</option><option value="barang_hilang">Barang hilang</option><option value="retur_penjualan">Penukaran customer</option><option value="write_off_rusak">Write-off rusak</option><option value="write_off_kadaluarsa">Write-off kedaluwarsa</option><option value="write_off_hilang">Write-off hilang</option><option value="koreksi_kurang">Koreksi kurang</option><option value="koreksi_lebih">Koreksi lebih</option><option value="retur_ke_supplier">Retur supplier</option>`;
      $('#periodic-year').value=new Date().getFullYear();
      await loadDashboard();
    }
  }catch(error){
    const setup='Periksa koneksi internet dan pastikan schema database RuangStok sudah dijalankan pada proyek Supabase.';
    toast('Aplikasi belum dapat terhubung ke Supabase.','error',error.message);
    $('#dashboard-kpis').innerHTML=emptyState('Supabase belum terhubung',setup);
  }
}
document.addEventListener('DOMContentLoaded',init);
