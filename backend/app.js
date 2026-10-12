/*
 * Wonder Merch — Sistem Persediaan & Analisis HPP
 *
 * Menjalankan dengan GitHub Pages (tanpa Node.js):
 * 1. Jalankan database/schema.sql di SQL Editor proyek Supabase.
 * 2. Publish folder frontend sebagai GitHub Pages. URL dan Publishable Key
 *    development sudah diatur di frontend/script.js; keduanya memang terlihat
 *    pada browser. Jangan pernah memakai service_role key di frontend.
 * 3. Gunakan data uji saja. RLS anon di schema hanya untuk development,
 *    transaksi stok tetap diproses secara atomik melalui Supabase RPC.
 *
 * Backend Express opsional:
 * 1. Pasang Node.js, jalankan `npm init -y` dan
 *    `npm install express cors @supabase/supabase-js multer`.
 * 2. Ganti SUPABASE_URL dan SUPABASE_KEY di bawah dengan URL dan Publishable Key.
 * 3. Jalankan `node app.js` dari folder backend, lalu buka http://localhost:3000.
 *    Frontend statis GitHub Pages tidak memerlukan server ini.
 * 4. Untuk produksi, tambahkan Supabase Auth, RLS berbasis identitas dan kontrol
 *    akses Storage. Bucket publik dapat dibaca siapa pun yang mengetahui URL.
 *
 * Aplikasi belum menggunakan login. Kebijakan anon pada schema hanya untuk
 * pembelajaran/development dan tidak aman untuk produksi.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bxsoljmuzwjrpvsrawnu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_phjuZESBR1om-ByOAaFqNg_jGiUiVy2';
const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = '1.0.0';
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const configured = /^https:\/\/.+\.supabase\.co$/.test(SUPABASE_URL) &&
  SUPABASE_KEY !== 'YOUR_SUPABASE_PUBLISHABLE_KEY';
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(FRONTEND_DIR));

class ApiError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function requireSupabase() {
  if (!supabase) throw new ApiError(503, 'SUPABASE_NOT_CONFIGURED',
    'Konfigurasi Supabase belum diisi.', 'Ganti SUPABASE_URL dan SUPABASE_KEY pada backend/app.js.');
  return supabase;
}

function send(res, data, message = 'Berhasil') {
  res.json({ success: true, data, message });
}

function fail(res, error) {
  const status = error.status || 400;
  const message = error instanceof ApiError ? error.message : 'Permintaan tidak dapat diproses.';
  const detail = error instanceof ApiError ? error.detail : (error.message || 'Periksa koneksi database dan schema.');
  res.status(status).json({ success: false, error: error.code || 'REQUEST_FAILED', message, detail });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function assert(condition, message, code = 'VALIDATION_ERROR') {
  if (!condition) throw new ApiError(400, code, message);
}

function intParam(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function pagination(query) {
  const page = intParam(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const limit = intParam(query.limit, 20, 1, 100);
  const order = query.order === 'asc' ? 'asc' : 'desc';
  const sort = String(query.sort || 'created_at');
  return { page, limit, order, sort, from: (page - 1) * limit, to: page * limit - 1 };
}

function parseDate(value, field) {
  if (!value) return null;
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)), `${field} tidak valid.`);
  return value;
}

function escapeLike(value) {
  return String(value || '').replace(/[,%()]/g, ' ').trim();
}

async function queryResult(query) {
  const { data, error, count } = await query;
  if (error) throw new ApiError(400, 'DATABASE_ERROR', 'Gagal mengambil atau menyimpan data.', error.message);
  return { data: data || [], count };
}

async function oneResult(query) {
  const { data, error } = await query;
  if (error) throw new ApiError(400, 'DATABASE_ERROR', 'Gagal mengambil atau menyimpan data.', error.message);
  return data;
}

async function rpc(name, params, message) {
  const { data, error } = await requireSupabase().rpc(name, params);
  if (error) throw new ApiError(400, 'TRANSACTION_REJECTED', error.message || message);
  return data;
}

async function allRows(table, columns = '*', configure) {
  let rows = [];
  let start = 0;
  while (true) {
    let query = requireSupabase().from(table).select(columns).range(start, start + 999);
    if (configure) query = configure(query);
    const batch = await queryResult(query);
    rows = rows.concat(batch.data);
    if (batch.data.length < 1000 || rows.length >= 10000) break;
    start += 1000;
  }
  return rows;
}

function validateItems(items, allowPrice = false) {
  assert(Array.isArray(items) && items.length > 0, 'Tambahkan minimal satu barang.');
  const productIds = new Set();
  for (const item of items) {
    assert(Number.isInteger(Number(item.produk_id)) && Number(item.produk_id) > 0, 'Produk harus dipilih.');
    assert(!productIds.has(Number(item.produk_id)), 'Produk yang sama tidak boleh muncul lebih dari satu kali dalam satu transaksi.');
    productIds.add(Number(item.produk_id));
    assert(Number.isInteger(Number(item.qty)) && Number(item.qty) > 0, 'Qty harus bilangan bulat positif.');
    if (allowPrice) assert(item.harga_jual_satuan !== undefined && Number.isFinite(Number(item.harga_jual_satuan)) && Number(item.harga_jual_satuan) >= 0,
      'Harga jual satuan wajib diisi dan tidak boleh negatif.');
  }
}

function safeCsv(value) {
  const text = value == null ? '' : String(value);
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csv(rows, columns) {
  const quote = value => `"${safeCsv(value).replace(/"/g, '""')}"`;
  return '\uFEFF' + [columns.map(c => quote(c.label)).join(','),
    ...rows.map(row => columns.map(c => quote(c.get(row))).join(','))].join('\r\n');
}

function publicFile(bucket, storedPath) {
  if (!storedPath) return null;
  const { data } = requireSupabase().storage.from(bucket).getPublicUrl(storedPath);
  return data.publicUrl;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = req.path === '/api/upload-foto-produk'
      ? { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }
      : { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
    if (!allowed[ext] || allowed[ext] !== file.mimetype) return cb(new ApiError(400, 'INVALID_FILE', 'Format file tidak didukung.'));
    if (req.path === '/api/upload-foto-produk' && file.size > 2 * 1024 * 1024)
      return cb(new ApiError(400, 'FILE_TOO_LARGE', 'Ukuran foto maksimal 2 MB.'));
    cb(null, true);
  }
});

function validMagic(file, isInvoice) {
  const b = file.buffer;
  if (file.mimetype === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.mimetype === 'image/png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return isInvoice && file.mimetype === 'application/pdf' && b.subarray(0, 5).toString() === '%PDF-';
}

async function uploadToBucket(req, bucket, maxBytes) {
  const client = requireSupabase();
  const file = req.file;
  assert(file, 'Pilih file yang akan diunggah.');
  assert(file.size <= maxBytes, `Ukuran file maksimal ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  assert(validMagic(file, bucket === 'invoices'), 'Isi file tidak sesuai dengan format yang diizinkan.');
  const ext = path.extname(file.originalname).toLowerCase();
  const storagePath = `${crypto.randomUUID()}${ext}`;
  const { error } = await client.storage.from(bucket).upload(storagePath, file.buffer, {
    contentType: file.mimetype, upsert: false
  });
  if (error) throw new ApiError(400, 'UPLOAD_FAILED', 'File gagal diunggah ke Supabase Storage.', error.message);
  return { path: storagePath, url: publicFile(bucket, storagePath), mime_type: file.mimetype };
}

// Health/config
app.get('/api/health', asyncRoute(async (req, res) => {
  let database = 'not_configured';
  if (supabase) {
    const { error } = await supabase.from('pengaturan').select('key').limit(1);
    database = error ? 'error' : 'connected';
  }
  send(res, { status: database === 'connected' ? 'ok' : database, backend: 'connected', supabase: database, version: APP_VERSION });
}));

app.get('/api/config/nota', asyncRoute(async (req, res) => {
  const rows = await allRows('pengaturan', 'key,value', q => q.in('key', ['nama_toko','alamat_toko','telepon_toko','footer_nota']));
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  send(res, { nama_toko: config.nama_toko || 'Wonder Merch (Nama toko belum diatur)', alamat: config.alamat_toko || '', telepon: config.telepon_toko || '', footer: config.footer_nota || 'Terima kasih telah berbelanja!' });
}));
app.get('/api/file-url', asyncRoute(async (req,res)=>{
  const bucket=String(req.query.bucket||'');const filePath=String(req.query.path||'');
  assert(['produk-images','invoices'].includes(bucket)&&filePath&&!filePath.includes('..'),'Referensi file tidak valid.');
  send(res,{url:publicFile(bucket,filePath)});
}));

// Product catalog and pricing
app.get('/api/produk', asyncRoute(async (req, res) => {
  const pg = pagination(req.query);
  const allowedSort = ['created_at','nama','sku','stok_saat_ini','harga_jual','hpp','updated_at'];
  const sort = allowedSort.includes(pg.sort) ? pg.sort : 'created_at';
  const needsClientFilter = req.query.stok_minimum === 'true' || Boolean(req.query.kategori_id);
  let query = requireSupabase().from('produk')
    .select('*,kategori:kategori!produk_kategori_id_fkey(id,nama,kode,parent_id,butuh_ukuran),ukuran:ukuran(id,nilai)',{count:'exact'})
    .order(sort, { ascending: pg.order === 'asc' });
  if (req.query.status === 'nonaktif') query=query.eq('status_aktif',false);
  else if(req.query.status!=='all') query=query.eq('status_aktif',true);
  if(req.query.search) query=query.or(`nama.ilike.%${escapeLike(req.query.search)}%,sku.ilike.%${escapeLike(req.query.search)}%`);
  if(req.query.subkategori_id) query=query.eq('kategori_id',Number(req.query.subkategori_id));
  if(req.query.ukuran_id) query=query.eq('ukuran_id',Number(req.query.ukuran_id));
  if(!needsClientFilter) query=query.range(pg.from,pg.to);
  let result=await queryResult(query);
  let rows=result.data;
  if(req.query.kategori_id) {
    const cats=await allRows('kategori','id,parent_id',q=>q.eq('parent_id',Number(req.query.kategori_id)));
    const ids=cats.map(c=>c.id);rows=rows.filter(p=>ids.includes(p.kategori_id));
  }
  if(req.query.stok_minimum==='true') rows=rows.filter(p=>p.stok_saat_ini<=p.stok_minimum);
  const total=needsClientFilter?rows.length:result.count||rows.length;
  if(needsClientFilter) rows=rows.slice(pg.from,pg.to+1);
  send(res,{items:rows,page:pg.page,limit:pg.limit,total});
}));

app.get('/api/produk/margin-review', asyncRoute(async (req, res) => {
  const ignored=String(req.query.ignored||'').split(',').filter(Boolean).map(Number);
  assert(ignored.every(Number.isInteger),'Daftar produk yang diabaikan tidak valid.');
  send(res,await rpc('produk_margin_review',{p_ignored:ignored}));
}));

app.get('/api/produk/:id', asyncRoute(async (req, res) => {
  const p = await oneResult(requireSupabase().from('produk').select('*,kategori:kategori!produk_kategori_id_fkey(*),ukuran:ukuran(*)').eq('id', req.params.id).maybeSingle());
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Produk tidak ditemukan.');
  send(res, p);
}));

app.post('/api/produk', asyncRoute(async (req, res) => {
  const b = req.body;
  assert(b.nama && b.kategori_id && b.satuan, 'Nama, sub-kategori, dan satuan wajib diisi.');
  assert(Number(b.stok_minimum || 0) >= 0 && Number(b.harga_jual || 0) >= 0, 'Stok minimum dan harga jual tidak boleh negatif.');
  assert(Number(b.margin_target || 0) >= 0 && Number(b.margin_target || 0) < 100, 'Margin target harus 0 sampai kurang dari 100%.');
  const row = { nama: b.nama.trim(), kategori_id: Number(b.kategori_id), satuan: b.satuan.trim(), ukuran_id: b.ukuran_id ? Number(b.ukuran_id) : null, foto_path: b.foto_path || null,
    stok_minimum: Number(b.stok_minimum || 0), harga_jual: Number(b.harga_jual || 0), margin_target: Number(b.margin_target || 0), status_aktif: true };
  const created = await oneResult(requireSupabase().from('produk').insert(row).select('*').single());
  send(res, created, 'Produk berhasil ditambahkan.');
}));

app.put('/api/produk/:id', asyncRoute(async (req, res) => {
  const b = req.body; const patch = {};
  ['nama','satuan','foto_path'].forEach(k => { if (b[k] !== undefined) patch[k] = b[k]; });
  if (b.kategori_id !== undefined) patch.kategori_id = Number(b.kategori_id);
  if (b.ukuran_id !== undefined) patch.ukuran_id = b.ukuran_id ? Number(b.ukuran_id) : null;
  if (b.stok_minimum !== undefined) { assert(Number.isInteger(Number(b.stok_minimum)) && Number(b.stok_minimum) >= 0, 'Stok minimum harus bilangan bulat nol atau lebih.'); patch.stok_minimum = Number(b.stok_minimum); }
  if (b.harga_jual !== undefined) { assert(Number(b.harga_jual) >= 0, 'Harga jual tidak boleh negatif.'); patch.harga_jual = Number(b.harga_jual); }
  if (b.margin_target !== undefined) { assert(Number(b.margin_target) >= 0 && Number(b.margin_target) < 100, 'Margin target harus 0 sampai kurang dari 100%.'); patch.margin_target = Number(b.margin_target); }
  if (b.status_aktif !== undefined) patch.status_aktif = Boolean(b.status_aktif);
  assert(!('stok_saat_ini' in b) && !('hpp' in b) && !('sku' in b), 'SKU, stok, dan HPP tidak dapat diubah melalui form produk.');
  if(patch.harga_jual!==undefined) {
    const current=await oneResult(requireSupabase().from('produk').select('hpp').eq('id',req.params.id).maybeSingle());
    if(!current) throw new ApiError(404,'NOT_FOUND','Produk tidak ditemukan.');
    patch.last_price_hpp=current.hpp;
  }
  const updated = await oneResult(requireSupabase().from('produk').update(patch).eq('id', req.params.id).select('*').single());
  send(res, updated, 'Produk berhasil diperbarui.');
}));

app.delete('/api/produk/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const used = await oneResult(requireSupabase().from('detail_pembelian').select('id').eq('produk_id', id).limit(1));
  const sold = await oneResult(requireSupabase().from('detail_penjualan').select('id').eq('produk_id', id).limit(1));
  const adjusted = await oneResult(requireSupabase().from('detail_penyesuaian').select('id').eq('produk_id', id).limit(1));
  if (used || sold || adjusted) {
    const data = await oneResult(requireSupabase().from('produk').update({ status_aktif: false }).eq('id',id).select().single());
    return send(res, data, 'Produk yang memiliki riwayat transaksi dinonaktifkan.');
  }
  const { error } = await requireSupabase().from('produk').delete().eq('id',id);
  if (error) throw new ApiError(400,'DELETE_FAILED','Produk gagal dihapus.',error.message);
  send(res, { id }, 'Produk berhasil dihapus.');
}));

app.post('/api/produk/:id/hitung-harga', asyncRoute(async (req, res) => {
  const margin = Number(req.body.margin_target);
  assert(Number.isFinite(margin) && margin > 0 && margin < 100, 'Margin target harus lebih besar dari 0 dan kurang dari 100%.');
  send(res, await rpc('hitung_harga_produk',{ p_id:Number(req.params.id),p_margin:margin,p_update:req.body.update !== false }), 'Harga jual berhasil dihitung.');
}));

app.post('/api/produk/bulk-set-margin', asyncRoute(async (req, res) => {
  assert(Array.isArray(req.body.ids) && req.body.ids.every(Number.isInteger), 'Pilih produk yang valid.');
  const margin = Number(req.body.margin_target);
  assert(Number.isFinite(margin) && margin >= 0 && margin < 100, 'Margin target harus 0 sampai kurang dari 100%.');
  send(res, await rpc('bulk_set_margin',{p_ids:req.body.ids,p_margin:margin}), 'Margin produk terpilih berhasil diperbarui.');
}));

// Suppliers, categories and sizes
app.get('/api/supplier', asyncRoute(async (req,res) => {
  const pg=pagination(req.query); const sorts=['created_at','nama'];
  let q=requireSupabase().from('supplier').select('*',{count:'exact'}).order(sorts.includes(pg.sort)?pg.sort:'created_at',{ascending:pg.order==='asc'}).range(pg.from,pg.to);
  if(req.query.search) q=q.ilike('nama',`%${escapeLike(req.query.search)}%`);
  if(req.query.status==='aktif') q=q.eq('status_aktif',true); if(req.query.status==='nonaktif') q=q.eq('status_aktif',false);
  const r=await queryResult(q); send(res,{items:r.data,page:pg.page,limit:pg.limit,total:r.count||0});
}));
app.get('/api/supplier/:id', asyncRoute(async(req,res)=>{
  const row=await oneResult(requireSupabase().from('supplier').select('*').eq('id',req.params.id).maybeSingle());
  if(!row) throw new ApiError(404,'NOT_FOUND','Supplier tidak ditemukan.');
  const history=await queryResult(requireSupabase().from('pembelian').select('*',{count:'exact'}).eq('supplier_id',req.params.id).order('tanggal',{ascending:false}).limit(100));
  send(res,{...row,riwayat_pembelian:history.data,total_transaksi:history.count||0,total_pembelian:history.data.filter(x=>x.status_transaksi==='posted').reduce((a,x)=>a+Number(x.total_biaya_perolehan),0)});
}));
app.post('/api/supplier',asyncRoute(async(req,res)=>{
  const b=req.body; assert(b.nama&&b.nama.trim(),'Nama supplier wajib diisi.');
  if(b.email) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email),'Format email tidak valid.');
  const row=await oneResult(requireSupabase().from('supplier').insert({nama:b.nama.trim(),alamat:b.alamat||null,email:b.email||null,telepon:b.telepon||null,bank_details:b.bank_details||null,notes:b.notes||null,status_aktif:true}).select().single());
  send(res,row,'Supplier berhasil ditambahkan.');
}));
app.put('/api/supplier/:id',asyncRoute(async(req,res)=>{
  const b=req.body; if(b.email) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email),'Format email tidak valid.');
  const patch={}; ['nama','alamat','email','telepon','bank_details','notes','status_aktif'].forEach(k=>{if(b[k]!==undefined) patch[k]=b[k];});
  if(patch.nama) assert(patch.nama.trim(),'Nama supplier wajib diisi.');
  send(res,await oneResult(requireSupabase().from('supplier').update(patch).eq('id',req.params.id).select().single()),'Supplier berhasil diperbarui.');
}));
app.delete('/api/supplier/:id',asyncRoute(async(req,res)=>{
  const used=await oneResult(requireSupabase().from('pembelian').select('id').eq('supplier_id',req.params.id).limit(1));
  if(used) return send(res,await oneResult(requireSupabase().from('supplier').update({status_aktif:false}).eq('id',req.params.id).select().single()),'Supplier dinonaktifkan karena memiliki riwayat pembelian.');
  const {error}=await requireSupabase().from('supplier').delete().eq('id',req.params.id); if(error) throw new ApiError(400,'DELETE_FAILED','Supplier gagal dihapus.',error.message);
  send(res,{id:Number(req.params.id)},'Supplier berhasil dihapus.');
}));

app.get('/api/kategori',asyncRoute(async(req,res)=>send(res,await allRows('kategori','*',q=>q.order('urutan').order('nama')))));
app.post('/api/kategori',asyncRoute(async(req,res)=>{
  const b=req.body; assert(b.nama&&b.kode,'Nama dan kode kategori wajib diisi.');
  if(b.parent_id) assert(await oneResult(requireSupabase().from('kategori').select('id').eq('id',b.parent_id).is('parent_id',null).maybeSingle()),'Kategori induk tidak valid.');
  send(res,await oneResult(requireSupabase().from('kategori').insert({nama:b.nama.trim(),kode:b.kode.trim().toUpperCase(),parent_id:b.parent_id||null,butuh_ukuran:Boolean(b.butuh_ukuran),urutan:Number(b.urutan||0)}).select().single()),'Kategori berhasil ditambahkan.');
}));
app.put('/api/kategori/:id',asyncRoute(async(req,res)=>{
  const b=req.body; const patch={}; ['nama','kode','parent_id','butuh_ukuran','urutan','status_aktif'].forEach(k=>{if(b[k]!==undefined) patch[k]=b[k];});
  if(patch.kode) patch.kode=patch.kode.trim().toUpperCase();
  send(res,await oneResult(requireSupabase().from('kategori').update(patch).eq('id',req.params.id).select().single()),'Kategori berhasil diperbarui.');
}));
app.delete('/api/kategori/:id',asyncRoute(async(req,res)=>{
  const id=Number(req.params.id);
  const [products,children,sizes]=await Promise.all([
    oneResult(requireSupabase().from('produk').select('id').eq('kategori_id',id).limit(1)),
    oneResult(requireSupabase().from('kategori').select('id').eq('parent_id',id).limit(1)),
    oneResult(requireSupabase().from('ukuran').select('id').eq('kategori_id',id).limit(1))
  ]);
  if(products||children||sizes) return send(res,await oneResult(requireSupabase().from('kategori').update({status_aktif:false}).eq('id',id).select().single()),'Kategori dinonaktifkan karena masih digunakan.');
  const {error}=await requireSupabase().from('kategori').delete().eq('id',id); if(error) throw new ApiError(400,'DELETE_FAILED','Kategori gagal dihapus.',error.message);
  send(res,{id},'Kategori berhasil dihapus.');
}));
app.get('/api/ukuran',asyncRoute(async(req,res)=>{
  let q=requireSupabase().from('ukuran').select('*').order('urutan').order('nilai');
  if(req.query.kategori_id) q=q.eq('kategori_id',req.query.kategori_id);
  if(req.query.all!=='true') q=q.eq('status_aktif',true);
  send(res,(await queryResult(q)).data);
}));
app.post('/api/ukuran',asyncRoute(async(req,res)=>{
  assert(req.body.kategori_id&&req.body.nilai,'Sub-kategori dan ukuran wajib diisi.');
  const cat=await oneResult(requireSupabase().from('kategori').select('id,parent_id').eq('id',req.body.kategori_id).maybeSingle());
  assert(cat&&cat.parent_id,'Ukuran harus terkait dengan sub-kategori.');
  send(res,await oneResult(requireSupabase().from('ukuran').insert({kategori_id:Number(req.body.kategori_id),nilai:req.body.nilai.trim(),urutan:Number(req.body.urutan||0)}).select().single()),'Ukuran berhasil ditambahkan.');
}));
app.put('/api/ukuran/:id',asyncRoute(async(req,res)=>{
  const patch={}; ['nilai','urutan','status_aktif'].forEach(k=>{if(req.body[k]!==undefined) patch[k]=req.body[k];});
  send(res,await oneResult(requireSupabase().from('ukuran').update(patch).eq('id',req.params.id).select().single()),'Ukuran berhasil diperbarui.');
}));
app.delete('/api/ukuran/:id',asyncRoute(async(req,res)=>{
  const used=await oneResult(requireSupabase().from('produk').select('id').eq('ukuran_id',req.params.id).limit(1));
  if(used) return send(res,await oneResult(requireSupabase().from('ukuran').update({status_aktif:false}).eq('id',req.params.id).select().single()),'Ukuran dinonaktifkan karena digunakan produk.');
  const {error}=await requireSupabase().from('ukuran').delete().eq('id',req.params.id); if(error) throw new ApiError(400,'DELETE_FAILED','Ukuran gagal dihapus.',error.message);
  send(res,{id:Number(req.params.id)},'Ukuran berhasil dihapus.');
}));

// Purchase receipts and invoice storage
app.get('/api/pembelian',asyncRoute(async(req,res)=>{
  const pg=pagination(req.query); const sorts=['tanggal','created_at','total_biaya_perolehan','nomor_transaksi'];
  let q=requireSupabase().from('pembelian').select('*,supplier:supplier(nama)',{count:'exact'}).order(sorts.includes(pg.sort)?pg.sort:'tanggal',{ascending:pg.order==='asc'}).range(pg.from,pg.to);
  if(req.query.tanggal_awal) q=q.gte('tanggal',parseDate(req.query.tanggal_awal,'Tanggal awal'));
  if(req.query.tanggal_akhir) q=q.lte('tanggal',parseDate(req.query.tanggal_akhir,'Tanggal akhir'));
  if(req.query.supplier_id) q=q.eq('supplier_id',req.query.supplier_id);
  if(req.query.search) q=q.ilike('nomor_transaksi',`%${escapeLike(req.query.search)}%`);
  const r=await queryResult(q); send(res,{items:r.data,page:pg.page,limit:pg.limit,total:r.count||0});
}));
app.get('/api/pembelian/:id',asyncRoute(async(req,res)=>{
  const h=await oneResult(requireSupabase().from('pembelian').select('*,supplier:supplier(nama)').eq('id',req.params.id).maybeSingle());
  if(!h) throw new ApiError(404,'NOT_FOUND','Pembelian tidak ditemukan.');
  h.details=(await queryResult(requireSupabase().from('detail_pembelian').select('*,produk:produk(sku,nama)').eq('pembelian_id',h.id))).data;
  h.invoice_url=publicFile('invoices',h.invoice_path); send(res,h);
}));
app.post('/api/pembelian',asyncRoute(async(req,res)=>{
  const b=req.body; validateItems(b.items);
  assert(Number(b.ongkir||0)>=0&&Number(b.biaya_lain||0)>=0,'Biaya tidak boleh negatif.');
  for(const item of b.items) assert(item.harga_beli_satuan!==undefined&&Number.isFinite(Number(item.harga_beli_satuan))&&Number(item.harga_beli_satuan)>=0,'Harga beli wajib diisi secara eksplisit dan tidak boleh negatif.');
  send(res,await rpc('post_pembelian',{payload:b}),'Barang masuk berhasil diposting.');
}));
app.post('/api/pembelian/:id/void',asyncRoute(async(req,res)=>send(res,await rpc('void_pembelian',{p_id:Number(req.params.id),alasan:req.body.alasan}), 'Pembelian berhasil dibatalkan.')));
app.post('/api/upload-invoice',upload.single('file'),asyncRoute(async(req,res)=>send(res,await uploadToBucket(req,'invoices',10*1024*1024),'Invoice berhasil diunggah.')));
app.post('/api/upload-foto-produk',upload.single('file'),asyncRoute(async(req,res)=>send(res,await uploadToBucket(req,'produk-images',2*1024*1024),'Foto produk berhasil diunggah.')));

// Outgoing sales, damage/loss and customer returns
app.get('/api/penjualan',asyncRoute(async(req,res)=>{
  const pg=pagination(req.query); const sorts=['tanggal','created_at','total_penjualan','nomor_transaksi'];
  let q=requireSupabase().from('penjualan').select('*',{count:'exact'}).order(sorts.includes(pg.sort)?pg.sort:'tanggal',{ascending:pg.order==='asc'}).range(pg.from,pg.to);
  if(req.query.tanggal_awal) q=q.gte('tanggal',parseDate(req.query.tanggal_awal,'Tanggal awal'));
  if(req.query.tanggal_akhir) q=q.lte('tanggal',parseDate(req.query.tanggal_akhir,'Tanggal akhir'));
  if(req.query.tanggal_awal) q=q.gte('tanggal',parseDate(req.query.tanggal_awal,'Tanggal awal'));
  if(req.query.tanggal_akhir) q=q.lte('tanggal',parseDate(req.query.tanggal_akhir,'Tanggal akhir'));
  if(req.query.jenis) q=q.eq('jenis_transaksi',req.query.jenis);
  if(req.query.search) q=q.ilike('nomor_transaksi',`%${escapeLike(req.query.search)}%`);
  const r=await queryResult(q); send(res,{items:r.data,page:pg.page,limit:pg.limit,total:r.count||0});
}));
app.get('/api/penjualan/:id',asyncRoute(async(req,res)=>{
  const h=await oneResult(requireSupabase().from('penjualan').select('*').eq('id',req.params.id).maybeSingle());
  if(!h) throw new ApiError(404,'NOT_FOUND','Transaksi tidak ditemukan.');
  h.details=(await queryResult(requireSupabase().from('detail_penjualan').select('*,produk:produk(sku,nama,ukuran:ukuran(nilai))').eq('penjualan_id',h.id))).data; send(res,h);
}));
app.post('/api/penjualan',asyncRoute(async(req,res)=>{
  const b=req.body; assert(['penjualan','barang_rusak','barang_hilang'].includes(b.jenis_transaksi),'Jenis transaksi tidak valid.');
  validateItems(b.items,b.jenis_transaksi==='penjualan');
  send(res,await rpc('post_penjualan',{payload:b}),'Transaksi barang keluar berhasil diposting.');
}));
app.post('/api/penjualan/:id/void',asyncRoute(async(req,res)=>send(res,await rpc('void_penjualan',{p_id:Number(req.params.id),alasan:req.body.alasan}),'Transaksi berhasil dibatalkan.')));
app.get('/api/penjualan/referensi/:nomor_transaksi',asyncRoute(async(req,res)=>{
  const h=await oneResult(requireSupabase().from('penjualan').select('*').eq('nomor_transaksi',req.params.nomor_transaksi).eq('jenis_transaksi','penjualan').maybeSingle());
  if(!h||h.status_transaksi!=='posted') throw new ApiError(404,'RETURN_REFERENCE_INVALID','Transaksi asal tidak ditemukan atau telah dibatalkan.');
  const [details,returns]=await Promise.all([
    queryResult(requireSupabase().from('detail_penjualan').select('*,produk:produk(sku,nama)').eq('penjualan_id',h.id)),
    queryResult(requireSupabase().from('penjualan').select('id,kondisi_barang,detail_penjualan(produk_id,qty)').eq('penjualan_asal_id',h.id).eq('jenis_transaksi','retur_penjualan').eq('status_transaksi','posted'))
  ]);
  const returned={}; for(const r of returns.data) for(const d of r.detail_penjualan||[]) returned[d.produk_id]=(returned[d.produk_id]||0)+d.qty;
  const elapsed=Math.floor((Date.now()-new Date(`${h.tanggal}T00:00:00`).getTime())/86400000);
  send(res,{...h,items:details.data.map(d=>({...d,qty_diretur:returned[d.produk_id]||0,qty_tersisa:d.qty-(returned[d.produk_id]||0)})),batas_hari:2,hari_berlalu:elapsed,bisa_ditukar:elapsed>=0&&elapsed<=2});
}));
app.post('/api/penjualan/tukar',asyncRoute(async(req,res)=>{
  const b=req.body;
  assert(b.nomor_transaksi_asal&&b.kondisi_barang&&Array.isArray(b.items)&&Array.isArray(b.items_pengganti),'Transaksi asal, kondisi barang, dan daftar produk wajib diisi.');
  send(res,await rpc('post_tukar_penjualan',{payload:b}),'Penukaran barang customer berhasil diproses.');
}));
app.post('/api/penjualan/retur',asyncRoute(async(req,res)=>{
  throw new ApiError(410,'CUSTOMER_REFUND_DISABLED','Retur dana customer dinonaktifkan. Gunakan penukaran barang maksimal 2 hari setelah pembelian.');
}));

// Inventory adjustments
app.get('/api/penyesuaian',asyncRoute(async(req,res)=>{
  const pg=pagination(req.query); let q=requireSupabase().from('penyesuaian_persediaan').select('*',{count:'exact'}).order('tanggal',{ascending:false}).range(pg.from,pg.to);
  if(req.query.search)q=q.ilike('nomor_transaksi',`%${escapeLike(req.query.search)}%`);
  const r=await queryResult(q);
  send(res,{items:r.data,page:pg.page,limit:pg.limit,total:r.count||0});
}));
app.get('/api/penyesuaian/:id',asyncRoute(async(req,res)=>{
  const h=await oneResult(requireSupabase().from('penyesuaian_persediaan').select('*').eq('id',req.params.id).maybeSingle());
  if(!h) throw new ApiError(404,'NOT_FOUND','Penyesuaian tidak ditemukan.');
  h.details=(await queryResult(requireSupabase().from('detail_penyesuaian').select('*,produk:produk(sku,nama)').eq('penyesuaian_id',h.id))).data; send(res,h);
}));
app.post('/api/penyesuaian',asyncRoute(async(req,res)=>{
  validateItems(req.body.items); assert(req.body.alasan,'Alasan penyesuaian wajib diisi.');
  send(res,await rpc('post_penyesuaian',{payload:req.body}),'Penyesuaian persediaan berhasil diposting.');
}));
app.post('/api/penyesuaian/:id/void',asyncRoute(async(req,res)=>send(res,await rpc('void_penyesuaian',{p_id:Number(req.params.id),p_alasan:req.body.alasan}),'Penyesuaian berhasil dibatalkan.')));

// Live stock card and Excel-safe CSV export
async function stockCardRows(query) {
  const from=parseDate(query.tanggal_awal,'Tanggal awal'); const to=parseDate(query.tanggal_akhir,'Tanggal akhir');
  const data=await rpc('hitung_kartu_persediaan',{p_produk_id:query.produk_id?Number(query.produk_id):null,p_tanggal_awal:from,p_tanggal_akhir:to});
  let rows=data||[];
  if(query.jenis) rows=rows.filter(x=>x.jenis===query.jenis);
  if(query.search){const s=String(query.search).toLowerCase(); rows=rows.filter(x=>`${x.sku} ${x.nama_produk} ${x.nomor_transaksi}`.toLowerCase().includes(s));}
  if(query.kategori_id){const ids=(await allRows('kategori','id,parent_id')).filter(c=>String(c.id)===String(query.kategori_id)||String(c.parent_id)===String(query.kategori_id)).map(c=>c.id); const pids=(await allRows('produk','id,kategori_id')).filter(p=>ids.includes(p.kategori_id)).map(p=>p.id); rows=rows.filter(x=>pids.includes(x.produk_id));}
  return rows;
}
app.get('/api/kartu-persediaan',asyncRoute(async(req,res)=>{
  const rows=await stockCardRows(req.query);
  const pg=pagination(req.query); send(res,{items:rows.slice(pg.from,pg.to+1),page:pg.page,limit:pg.limit,total:rows.length});
}));
app.get('/api/kartu-persediaan/export',asyncRoute(async(req,res)=>{
  const rows=await stockCardRows(req.query);
  const columns=[
    {label:'Tanggal',get:r=>r.tanggal},{label:'Nomor Transaksi',get:r=>r.nomor_transaksi},{label:'SKU',get:r=>r.sku},{label:'Nama Produk',get:r=>r.nama_produk},
    {label:'Kategori',get:r=>r.kategori},{label:'Jenis',get:r=>r.jenis},{label:'Keterangan',get:r=>r.keterangan},{label:'Qty Masuk',get:r=>r.qty_masuk},
    {label:'Nilai Masuk',get:r=>r.nilai_masuk},{label:'Qty Keluar',get:r=>r.qty_keluar},{label:'HPP Keluar',get:r=>r.hpp_keluar},
    {label:'Saldo Qty',get:r=>r.saldo_qty},{label:'HPP Rata-rata',get:r=>r.hpp_rata_rata},{label:'Saldo Nilai',get:r=>r.saldo_nilai}
  ];
  res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition','attachment; filename="kartu-persediaan.csv"'); res.send(csv(rows||[],columns));
}));

// Dashboard and reporting
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function startOfWeek(date) { const d=new Date(date); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return localDate(d); }
function dateRange(period) {
  const now=new Date(); const today=localDate(now);
  if(period==='hari_ini') return [today,today];
  if(period==='minggu_ini') return [startOfWeek(now),today];
  return [`${today.slice(0,7)}-01`,today];
}
app.get('/api/dashboard',asyncRoute(async(req,res)=>{
  const [start,end]=dateRange(req.query.periode||'bulan_ini');
  const report=await rpc('dashboard_report',{p_awal:start,p_akhir:end});
  send(res,{...report,periode:[start,end]});
}));

function periodBounds(preset) {
  const d=new Date(); const today=localDate(d);
  if(preset==='hari_ini') return [today,today];
  if(preset==='7_hari') { d.setDate(d.getDate()-6); return [localDate(d),today]; }
  if(preset==='bulan_lalu') { d.setDate(1);d.setMonth(d.getMonth()-1);const s=localDate(d);d.setMonth(d.getMonth()+1);d.setDate(0);return [s,localDate(d)];}
  if(preset==='triwulan_ini') {const m=Math.floor(d.getMonth()/3)*3;d.setMonth(m,1);return [localDate(d),today];}
  if(preset==='6_bulan') {d.setMonth(d.getMonth()-5,1);return [localDate(d),today];}
  if(preset==='tahun_ini') return [`${d.getFullYear()}-01-01`,today];
  if(preset==='tahun_lalu') return [`${d.getFullYear()-1}-01-01`,`${d.getFullYear()-1}-12-31`];
  return [`${today.slice(0,7)}-01`,today];
}
app.get('/api/analisis-hpp',asyncRoute(async(req,res)=>{
  let [start,end]=req.query.tanggal_awal&&req.query.tanggal_akhir?[parseDate(req.query.tanggal_awal,'Tanggal awal'),parseDate(req.query.tanggal_akhir,'Tanggal akhir')]:periodBounds(req.query.periode||'bulan_ini');
  const report=await rpc('analisis_hpp_report',{p_awal:start,p_akhir:end});
  send(res,{...report,periode:{awal:start,akhir:end}});
}));
app.get('/api/analisis-hpp/performa-kategori',asyncRoute(async(req,res)=>{
  send(res,await rpc('performa_kategori_report',{p_level:req.query.level==='subkategori'?'subkategori':'induk'}));
}));

app.get('/api/analisis-hpp/periodik',asyncRoute(async(req,res)=>{
  const type=req.query.type||'bulanan'; const year=Number(req.query.tahun||new Date().getFullYear());
  assert(['bulanan','triwulanan','semester','tahunan'].includes(type),'Jenis laporan periodik tidak valid.');
  assert(Number.isInteger(year)&&year>=2000&&year<=2100,'Tahun laporan harus antara 2000 dan 2100.');
  send(res,await rpc('analisis_periodik_report',{p_type:type,p_year:year}));
}));
app.get('/api/pengaturan',asyncRoute(async(req,res)=>send(res,Object.fromEntries((await allRows('pengaturan','key,value,tipe,deskripsi')).map(x=>[x.key,x])))));
app.put('/api/pengaturan',asyncRoute(async(req,res)=>{
  const allowed=['nama_toko','alamat_toko','telepon_toko','email_toko','footer_nota','threshold_dead_stock_hari','threshold_slow_moving_hari','minimal_qty_evaluasi_margin'];
  const payload={}; for(const key of allowed) if(req.body[key]!==undefined) payload[key]=req.body[key];
  for(const key of ['threshold_dead_stock_hari','threshold_slow_moving_hari','minimal_qty_evaluasi_margin']) if(payload[key]!==undefined) assert(Number.isInteger(Number(payload[key]))&&Number(payload[key])>=0,`${key} harus berupa bilangan bulat nol atau lebih.`);
  if(payload.email_toko) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email_toko),'Email toko tidak valid.');
  send(res,await rpc('save_pengaturan',{payload}), 'Pengaturan berhasil disimpan.');
}));

app.use('/api', (req,res)=>res.status(404).json({success:false,error:'ENDPOINT_NOT_FOUND',message:'Endpoint tidak ditemukan.',detail:req.method+' '+req.path}));
app.get(/.*/,(req,res)=>res.sendFile(path.join(FRONTEND_DIR,'index.html')));
app.use((error,req,res,next)=>{
  if(res.headersSent) return next(error);
  if(error instanceof multer.MulterError) {
    const tooLarge=error.code==='LIMIT_FILE_SIZE';
    return fail(res,new ApiError(400,tooLarge?'FILE_TOO_LARGE':'UPLOAD_ERROR',tooLarge?'Ukuran file melebihi batas.':'Upload gagal.',error.message));
  }
  if(error instanceof ApiError) return fail(res,error);
  return fail(res,error);
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Wonder Merch berjalan pada http://localhost:${PORT}`));
}

module.exports = app;
