-- Wonder Merch inventory schema for Supabase/PostgreSQL.
-- DEVELOPMENT ONLY: the anon policies below allow anonymous callers to access
-- application data. They are NOT safe for production. Add Supabase Auth,
-- identity-scoped RLS policies, and access restrictions before real use.
-- Public Storage buckets expose files to anyone who knows the URL. UUID file
-- names reduce guessability but are not access control; use signed URLs for
-- invoices in production.

create extension if not exists pgcrypto;

create table if not exists kategori (
  id bigserial primary key,
  parent_id bigint references kategori(id),
  nama text not null,
  kode text not null unique,
  butuh_ukuran boolean not null default false,
  urutan integer not null default 0,
  status_aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kategori_nama_nonempty check (length(trim(nama)) > 0),
  constraint kategori_kode_nonempty check (length(trim(kode)) > 0),
  constraint kategori_not_self_parent check (parent_id is null or parent_id <> id)
);

create table if not exists ukuran (
  id bigserial primary key,
  kategori_id bigint not null references kategori(id),
  nilai text not null,
  urutan integer not null default 0,
  status_aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique(kategori_id, nilai)
);

create table if not exists supplier (
  id bigserial primary key,
  nama text not null,
  alamat text,
  email text,
  telepon text,
  bank_details text,
  notes text,
  status_aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_nama_nonempty check (length(trim(nama)) > 0)
);

create table if not exists produk (
  id bigserial primary key,
  sku text unique not null,
  nama text not null,
  kategori_id bigint not null references kategori(id),
  satuan text not null,
  ukuran_id bigint references ukuran(id),
  foto_path text,
  stok_minimum integer not null default 0 check (stok_minimum >= 0),
  stok_saat_ini integer not null default 0 check (stok_saat_ini >= 0),
  hpp numeric(20,4) not null default 0 check (hpp >= 0),
  harga_jual numeric(20,2) not null default 0 check (harga_jual >= 0),
  margin_target numeric(7,3) not null default 0 check (margin_target >= 0 and margin_target < 100),
  last_out_date date,
  last_price_hpp numeric(20,4),
  status_aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint produk_nama_nonempty check (length(trim(nama)) > 0),
  constraint produk_satuan_nonempty check (length(trim(satuan)) > 0)
);

create table if not exists pembelian (
  id bigserial primary key,
  nomor_transaksi text unique not null,
  supplier_id bigint not null references supplier(id),
  tanggal date not null,
  total_barang numeric(20,2) not null default 0,
  ongkir numeric(20,2) not null default 0 check (ongkir >= 0),
  biaya_lain numeric(20,2) not null default 0 check (biaya_lain >= 0),
  keterangan_biaya_lain text,
  total_biaya_perolehan numeric(20,2) not null default 0,
  invoice_path text,
  catatan text,
  status_transaksi text not null default 'posted' check (status_transaksi in ('posted','void')),
  created_at timestamptz not null default now()
);

create table if not exists detail_pembelian (
  id bigserial primary key,
  pembelian_id bigint not null references pembelian(id) on delete cascade,
  produk_id bigint not null references produk(id),
  qty integer not null check (qty > 0),
  harga_beli_satuan numeric(20,4) not null check (harga_beli_satuan >= 0),
  subtotal numeric(20,2) not null,
  alokasi_biaya numeric(20,2) not null default 0,
  biaya_perolehan_total numeric(20,2) not null,
  biaya_perolehan_satuan numeric(20,4) not null,
  created_at timestamptz not null default now()
);

create table if not exists penjualan (
  id bigserial primary key,
  nomor_transaksi text unique not null,
  tanggal date not null,
  jenis_transaksi text not null check (jenis_transaksi in ('penjualan','barang_rusak','barang_hilang','retur_penjualan')),
  channel text,
  no_referensi text,
  catatan text,
  penjualan_asal_id bigint references penjualan(id),
  alasan_retur text,
  kondisi_barang text check (kondisi_barang in ('layak_jual','tidak_layak_jual') or kondisi_barang is null),
  total_penjualan numeric(20,2) not null default 0,
  total_hpp numeric(20,2) not null default 0,
  total_laba_kotor numeric(20,2) not null default 0,
  status_transaksi text not null default 'posted' check (status_transaksi in ('posted','void')),
  created_at timestamptz not null default now()
);

create table if not exists detail_penjualan (
  id bigserial primary key,
  penjualan_id bigint not null references penjualan(id) on delete cascade,
  produk_id bigint not null references produk(id),
  qty integer not null check (qty > 0),
  harga_jual_satuan numeric(20,2),
  hpp_snapshot_satuan numeric(20,4) not null,
  hpp_total numeric(20,2) not null,
  subtotal_penjualan numeric(20,2) not null default 0,
  laba_kotor numeric(20,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists penyesuaian_persediaan (
  id bigserial primary key,
  nomor_transaksi text unique not null,
  tanggal date not null,
  jenis text not null check (jenis in ('write_off_rusak','write_off_kadaluarsa','write_off_hilang','disposal','donasi','koreksi_kurang','koreksi_lebih','retur_ke_supplier')),
  total_nilai numeric(20,2) not null default 0,
  alasan text not null,
  status_transaksi text not null default 'posted' check (status_transaksi in ('posted','void')),
  pembelian_asal_id bigint references pembelian(id),
  created_at timestamptz not null default now()
);

create table if not exists detail_penyesuaian (
  id bigserial primary key,
  penyesuaian_id bigint not null references penyesuaian_persediaan(id) on delete cascade,
  produk_id bigint not null references produk(id),
  qty integer not null check (qty <> 0),
  hpp_snapshot_satuan numeric(20,4) not null,
  nilai_total numeric(20,2) not null,
  catatan text
);

create table if not exists pengaturan (
  id bigserial primary key,
  key text unique not null,
  value text,
  tipe text not null default 'string',
  deskripsi text,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  tabel text not null,
  record_id bigint not null,
  aksi text not null,
  data_sebelum jsonb,
  data_sesudah jsonb,
  alasan text,
  created_at timestamptz not null default now()
);

-- Internal counters make transaction references and SKUs safe under concurrency.
create table if not exists nomor_harian (
  prefix text not null,
  tanggal date not null,
  nomor bigint not null default 0,
  primary key(prefix, tanggal)
);
create table if not exists sku_counter (
  kode text primary key,
  nomor bigint not null default 0
);

create index if not exists idx_produk_kategori on produk(kategori_id);
create index if not exists idx_produk_aktif on produk(status_aktif);
create index if not exists idx_detail_penjualan_produk on detail_penjualan(produk_id);
create index if not exists idx_detail_penjualan_header on detail_penjualan(penjualan_id);
create index if not exists idx_detail_pembelian_produk on detail_pembelian(produk_id);
create index if not exists idx_detail_pembelian_header on detail_pembelian(pembelian_id);
create index if not exists idx_penjualan_tanggal on penjualan(tanggal);
create index if not exists idx_penjualan_jenis_status on penjualan(jenis_transaksi,status_transaksi);
create index if not exists idx_pembelian_tanggal on pembelian(tanggal);
create index if not exists idx_pembelian_supplier on pembelian(supplier_id);
create index if not exists idx_penyesuaian_tanggal on penyesuaian_persediaan(tanggal);
create index if not exists idx_audit_record on audit_log(tabel,record_id);
create index if not exists idx_ukuran_kategori on ukuran(kategori_id,status_aktif);

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_produk_updated on produk;
create trigger trg_produk_updated before update on produk for each row execute function set_updated_at();
drop trigger if exists trg_supplier_updated on supplier;
create trigger trg_supplier_updated before update on supplier for each row execute function set_updated_at();
drop trigger if exists trg_kategori_updated on kategori;
create trigger trg_kategori_updated before update on kategori for each row execute function set_updated_at();
drop trigger if exists trg_pengaturan_updated on pengaturan;
create trigger trg_pengaturan_updated before update on pengaturan for each row execute function set_updated_at();

create or replace function validate_kategori_hierarchy() returns trigger language plpgsql as $$
declare p_parent bigint;
begin
  if new.parent_id is not null then
    select parent_id into p_parent from kategori where id = new.parent_id;
    if not found then raise exception 'Kategori induk tidak ditemukan'; end if;
    if p_parent is not null then raise exception 'Kategori hanya boleh memiliki dua level'; end if;
    if new.parent_id = new.id then raise exception 'Kategori tidak dapat menjadi induk dirinya sendiri'; end if;
    new.butuh_ukuran := coalesce(new.butuh_ukuran,false);
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_kategori on kategori;
create trigger trg_validate_kategori before insert or update of parent_id on kategori for each row execute function validate_kategori_hierarchy();

create or replace function protect_product_inventory() returns trigger language plpgsql security definer set search_path=public as $$
declare code text; n bigint; requires_size boolean;
begin
  if tg_op = 'INSERT' then
    select kode,butuh_ukuran into code,requires_size from kategori where id = new.kategori_id and parent_id is not null and status_aktif;
    if code is null then raise exception 'Pilih sub-kategori aktif yang valid'; end if;
    if requires_size and new.ukuran_id is null then raise exception 'Ukuran wajib dipilih untuk sub-kategori ini'; end if;
    insert into sku_counter(kode,nomor) values(code,1)
      on conflict(kode) do update set nomor=sku_counter.nomor+1 returning nomor into n;
    new.sku := code || '-' || lpad(n::text,4,'0');
    new.stok_saat_ini := 0;
    new.hpp := 0;
    if new.ukuran_id is not null and not exists(select 1 from ukuran where id=new.ukuran_id and kategori_id=new.kategori_id and status_aktif) then
      raise exception 'Ukuran tidak sesuai dengan sub-kategori';
    end if;
  else
    if (new.stok_saat_ini, new.hpp) is distinct from (old.stok_saat_ini, old.hpp)
       and current_setting('app.inventory_rpc',true) is distinct from 'on' then
      raise exception 'Stok dan HPP hanya dapat diubah melalui transaksi';
    end if;
    if new.sku is distinct from old.sku then raise exception 'SKU tidak dapat diubah'; end if;
    select butuh_ukuran into requires_size from kategori where id=new.kategori_id and parent_id is not null;
    if not found then raise exception 'Pilih sub-kategori yang valid'; end if;
    if requires_size and new.ukuran_id is null then raise exception 'Ukuran wajib dipilih untuk sub-kategori ini'; end if;
    if new.ukuran_id is not null and not exists(select 1 from ukuran where id=new.ukuran_id and kategori_id=new.kategori_id) then
      raise exception 'Ukuran tidak sesuai dengan sub-kategori';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_product_inventory on produk;
create trigger trg_protect_product_inventory before insert or update on produk for each row execute function protect_product_inventory();

create or replace function audit_row_change() returns trigger language plpgsql security definer set search_path=public as $$
declare before_data jsonb; after_data jsonb; rid bigint;
begin
  if tg_op <> 'INSERT' then before_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_data := to_jsonb(new); end if;
  rid := coalesce((after_data->>'id')::bigint,(before_data->>'id')::bigint);
  insert into audit_log(tabel,record_id,aksi,data_sebelum,data_sesudah)
  values(tg_table_name,rid,lower(tg_op),before_data,after_data);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
  foreach t in array array['produk','supplier','kategori','ukuran','pembelian','penjualan','penyesuaian_persediaan','pengaturan']
  loop
    execute format('drop trigger if exists audit_%I on %I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on %I for each row execute function audit_row_change()',t,t);
  end loop;
end $$;

-- Transactional tables are read-only through direct PostgREST table APIs.
-- Their writes use SECURITY DEFINER PostgreSQL functions exposed as RPC.
do $$ declare t text; begin
 foreach t in array array['pembelian','detail_pembelian','penjualan','detail_penjualan','penyesuaian_persediaan','detail_penyesuaian']
 loop
   execute format('drop policy if exists dev_anon_all on %I',t);
   execute format('drop policy if exists dev_anon_read on %I',t);
   execute format('create policy dev_anon_read on %I for select to anon using (true)',t);
   execute format('revoke insert,update,delete on %I from anon,authenticated',t);
 end loop;
end $$;
drop policy if exists dev_anon_all on audit_log;
drop policy if exists dev_anon_all on nomor_harian;
drop policy if exists dev_anon_all on sku_counter;
revoke all on audit_log,nomor_harian,sku_counter from anon,authenticated;

create or replace function generate_nomor_transaksi(prefix text, p_tanggal date default current_date)
returns text language plpgsql security definer set search_path=public as $$
declare n bigint;
begin
  insert into nomor_harian(prefix,tanggal,nomor) values(generate_nomor_transaksi.prefix,p_tanggal,1)
  on conflict on constraint nomor_harian_pkey
  do update set nomor=nomor_harian.nomor+1 returning nomor into n;
  return prefix || '-' || to_char(p_tanggal,'YYYYMMDD') || '-' || lpad(n::text,4,'0');
end $$;

create or replace function post_pembelian(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare sid bigint; dt date; ong numeric; lain numeric; subtotal_sum numeric; extra numeric; total numeric;
  head_id bigint; no text; item jsonb; pid bigint; q integer; price numeric; sub numeric; alloc numeric;
  allocated numeric:=0; base numeric; unit_cost numeric; old_stock integer; old_hpp numeric; next_stock integer; new_hpp numeric;
  details jsonb:='[]'::jsonb; item_count integer:=0; inv_path text;
begin
  sid := (payload->>'supplier_id')::bigint; dt := coalesce((payload->>'tanggal')::date,current_date);
  ong := coalesce((payload->>'ongkir')::numeric,0); lain := coalesce((payload->>'biaya_lain')::numeric,0);
  if ong<0 or lain<0 then raise exception 'Ongkir dan biaya lain tidak boleh negatif'; end if;
  if not exists(select 1 from supplier where id=sid and status_aktif) then raise exception 'Supplier tidak ditemukan atau nonaktif'; end if;
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items')=0 then raise exception 'Minimal satu barang harus ditambahkan'; end if;
  perform set_config('app.inventory_rpc','on',true);
  for pid in select distinct (x->>'produk_id')::bigint from jsonb_array_elements(payload->'items') x order by 1 loop
    perform 1 from produk where id=pid and status_aktif for update;
    if not found then raise exception 'Produk % tidak ditemukan atau nonaktif',pid; end if;
  end loop;
  select coalesce(sum(round((x->>'qty')::numeric*(x->>'harga_beli_satuan')::numeric,2)),0)
    into subtotal_sum from jsonb_array_elements(payload->'items') x;
  extra := ong+lain;
  if subtotal_sum=0 and extra>0 then raise exception 'Biaya tambahan tidak dapat dialokasikan karena total subtotal barang nol'; end if;
  total := subtotal_sum+extra;
  no := generate_nomor_transaksi('PBM',dt);
  insert into pembelian(nomor_transaksi,supplier_id,tanggal,total_barang,ongkir,biaya_lain,keterangan_biaya_lain,total_biaya_perolehan,invoice_path,catatan)
  values(no,sid,dt,subtotal_sum,ong,lain,payload->>'keterangan_biaya_lain',total,payload->>'invoice_path',payload->>'catatan') returning id into head_id;
  for item in select value from jsonb_array_elements(payload->'items') loop
    pid := (item->>'produk_id')::bigint; q := (item->>'qty')::integer; price := (item->>'harga_beli_satuan')::numeric;
    if q<=0 or price<0 then raise exception 'Qty harus positif dan harga beli tidak boleh negatif'; end if;
    sub := round(q*price,2);
    if extra=0 then alloc:=0;
    elsif item_count=(jsonb_array_length(payload->'items')-1) then alloc:=round(extra-allocated,2);
    else alloc:=round((sub/nullif(subtotal_sum,0))*extra,2); allocated:=allocated+alloc;
    end if;
    item_count:=item_count+1; base:=sub+alloc; unit_cost:=base/q;
    select stok_saat_ini,hpp into old_stock,old_hpp from produk where id=pid;
    next_stock:=old_stock+q;
    new_hpp:=round(((old_stock*old_hpp)+base)/next_stock,4);
    insert into detail_pembelian(pembelian_id,produk_id,qty,harga_beli_satuan,subtotal,alokasi_biaya,biaya_perolehan_total,biaya_perolehan_satuan)
    values(head_id,pid,q,price,sub,alloc,base,unit_cost) returning to_jsonb(detail_pembelian.*) into item;
    details:=details||jsonb_build_array(item);
    update produk set stok_saat_ini=next_stock,hpp=new_hpp,
      harga_jual=case when harga_jual=0 and old_hpp=0 and margin_target>0 then round(new_hpp/(1-margin_target/100),2) else harga_jual end,
      last_price_hpp=case when harga_jual=0 and old_hpp=0 and margin_target>0 then new_hpp else last_price_hpp end
      where id=pid;
  end loop;
  return jsonb_build_object('id',head_id,'nomor_transaksi',no,'tanggal',dt,'total_barang',subtotal_sum,'total_biaya_perolehan',total,'details',details);
end $$;

create or replace function post_penjualan(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare kind text:=payload->>'jenis_transaksi'; dt date:=coalesce((payload->>'tanggal')::date,current_date);
  prefix text; no text; hid bigint; item jsonb; pid bigint; q integer; price numeric; stock integer; cost numeric;
  rev numeric:=0; cogs numeric:=0; details jsonb:='[]'::jsonb; d jsonb;
begin
  if kind not in ('penjualan','barang_rusak','barang_hilang') then raise exception 'Jenis transaksi tidak valid'; end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then raise exception 'Minimal satu barang harus ditambahkan'; end if;
  perform set_config('app.inventory_rpc','on',true);
  for pid in select distinct (x->>'produk_id')::bigint from jsonb_array_elements(payload->'items') x order by 1 loop
    perform 1 from produk where id=pid and status_aktif for update;
    if not found then raise exception 'Produk % tidak ditemukan atau nonaktif',pid; end if;
  end loop;
  prefix:=case kind when 'penjualan' then 'PJL' when 'barang_rusak' then 'RUS' else 'HIL' end;
  no:=generate_nomor_transaksi(prefix,dt);
  insert into penjualan(nomor_transaksi,tanggal,jenis_transaksi,channel,no_referensi,catatan)
   values(no,dt,kind,payload->>'channel',payload->>'no_referensi',payload->>'catatan') returning id into hid;
  for item in select value from jsonb_array_elements(payload->'items') loop
    pid:=(item->>'produk_id')::bigint; q:=(item->>'qty')::integer;
    if q<=0 then raise exception 'Qty harus bilangan bulat positif'; end if;
    select stok_saat_ini,hpp into stock,cost from produk where id=pid;
    if stock<q then raise exception 'Stok tidak cukup untuk produk % (tersedia %)',pid,stock; end if;
    price:=case when kind='penjualan' then (item->>'harga_jual_satuan')::numeric else 0 end;
    if kind='penjualan' and (price is null or price<0) then raise exception 'Harga jual tidak valid'; end if;
    insert into detail_penjualan(penjualan_id,produk_id,qty,harga_jual_satuan,hpp_snapshot_satuan,hpp_total,subtotal_penjualan,laba_kotor)
      values(hid,pid,q,case when kind='penjualan' then price else null end,cost,round(q*cost,2),
      case when kind='penjualan' then round(q*price,2) else 0 end,
      case when kind='penjualan' then round(q*(price-cost),2) else 0 end)
      returning to_jsonb(detail_penjualan.*) into d;
    details:=details||jsonb_build_array(d); cogs:=cogs+round(q*cost,2);
    if kind='penjualan' then rev:=rev+round(q*price,2); end if;
    update produk set stok_saat_ini=stock-q,last_out_date=greatest(coalesce(last_out_date,dt),dt) where id=pid;
  end loop;
  update penjualan set total_penjualan=rev,total_hpp=cogs,total_laba_kotor=case when kind='penjualan' then rev-cogs else 0 end where id=hid;
  return jsonb_build_object('id',hid,'nomor_transaksi',no,'tanggal',dt,'jenis_transaksi',kind,'total_penjualan',rev,'total_hpp',cogs,'total_laba_kotor',case when kind='penjualan' then rev-cogs else 0 end,'details',details);
end $$;

create or replace function post_retur_penjualan(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Pengembalian dana customer dinonaktifkan. Gunakan penukaran barang.';
end $$;

create or replace function post_tukar_penjualan(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare src penjualan%rowtype; dt date:=coalesce((payload->>'tanggal')::date,current_date);
  no text; return_id bigint; item jsonb; pid bigint; q integer; sold integer; returned integer;
  snap numeric; price numeric; condition text:=payload->>'kondisi_barang'; rev numeric:=0; cogs numeric:=0;
  stock integer; old_hpp numeric; details jsonb:='[]'::jsonb; d jsonb; sale_items jsonb;
  sale_result jsonb; return_qty integer:=0; replacement_qty integer:=0; replacement_total numeric:=0; difference numeric;
begin
  select * into src from penjualan
    where nomor_transaksi=payload->>'nomor_transaksi_asal' and jenis_transaksi='penjualan'
    for update;
  if not found or src.status_transaksi<>'posted' then raise exception 'Transaksi penjualan asal tidak ditemukan atau tidak aktif'; end if;
  if current_date<src.tanggal or current_date>src.tanggal+2 or dt<src.tanggal or dt>current_date
    then raise exception 'Penukaran hanya diizinkan maksimal 2 hari setelah transaksi'; end if;
  if condition not in ('layak_jual','tidak_layak_jual') then raise exception 'Kondisi barang yang ditukar tidak valid'; end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then raise exception 'Pilih barang asal yang akan ditukar'; end if;
  if jsonb_typeof(payload->'items_pengganti')<>'array' or jsonb_array_length(payload->'items_pengganti')=0 then raise exception 'Pilih minimal satu produk pengganti'; end if;
  if exists(
    select 1 from jsonb_array_elements(payload->'items') x
    group by (x->>'produk_id')::bigint having count(*)>1
  ) then raise exception 'Produk asal yang sama hanya boleh dipilih satu kali'; end if;
  select coalesce(sum((x->>'qty')::integer),0) into return_qty
    from jsonb_array_elements(payload->'items') x;
  select coalesce(sum((x->>'qty')::integer),0) into replacement_qty
    from jsonb_array_elements(payload->'items_pengganti') x;
  if return_qty<=0 or replacement_qty<>return_qty then raise exception 'Jumlah barang pengganti harus sama dengan jumlah barang yang ditukar'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'items') x where coalesce((x->>'qty')::integer,0)<=0)
    or exists(select 1 from jsonb_array_elements(payload->'items_pengganti') x where coalesce((x->>'qty')::integer,0)<=0)
  then raise exception 'Jumlah barang harus berupa bilangan bulat positif'; end if;
  perform set_config('app.inventory_rpc','on',true);
  for pid in
    select distinct product_id from (
      select (x->>'produk_id')::bigint product_id from jsonb_array_elements(payload->'items') x
      union all
      select (x->>'produk_id')::bigint from jsonb_array_elements(payload->'items_pengganti') x
    ) products order by product_id
  loop
    perform 1 from produk where id=pid for update;
    if not found then raise exception 'Produk % tidak ditemukan',pid; end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'items_pengganti') loop
    pid:=(item->>'produk_id')::bigint;
    if not exists(select 1 from produk where id=pid and status_aktif) then raise exception 'Produk pengganti tidak ditemukan atau nonaktif'; end if;
    if not exists(select 1 from produk where id=pid and harga_jual>0) then raise exception 'Harga jual produk pengganti harus lebih besar dari nol'; end if;
    replacement_total:=replacement_total+round((item->>'qty')::integer*(select harga_jual from produk where id=pid),2);
  end loop;
  for item in select value from jsonb_array_elements(payload->'items') loop
    pid:=(item->>'produk_id')::bigint; q:=(item->>'qty')::integer;
    select coalesce(sum(qty),0) into sold from detail_penjualan where penjualan_id=src.id and produk_id=pid;
    select coalesce(sum(d.qty),0) into returned from detail_penjualan d join penjualan h on h.id=d.penjualan_id
      where h.penjualan_asal_id=src.id and h.jenis_transaksi='retur_penjualan' and h.status_transaksi='posted' and d.produk_id=pid;
    if sold=0 or q>sold-returned then raise exception 'Qty penukaran melebihi jumlah yang masih dapat ditukar untuk produk %',pid; end if;
    select round(sum(harga_jual_satuan*qty)/sum(qty),4),round(sum(hpp_snapshot_satuan*qty)/sum(qty),4)
      into price,snap from detail_penjualan where penjualan_id=src.id and produk_id=pid;
    rev:=rev+round(q*price,2); cogs:=cogs+round(q*snap,2);
  end loop;
  difference:=round(replacement_total-rev,2);
  if difference<>0 and coalesce((payload->>'selisih_diselesaikan')::boolean,false)=false then
    raise exception 'Selesaikan selisih harga barang sebelum menyimpan penukaran';
  end if;
  no:=generate_nomor_transaksi('TUK',dt);
  insert into penjualan(nomor_transaksi,tanggal,jenis_transaksi,penjualan_asal_id,alasan_retur,kondisi_barang,catatan)
    values(no,dt,'retur_penjualan',src.id,payload->>'alasan',condition,payload->>'catatan')
    returning id into return_id;
  for item in select value from jsonb_array_elements(payload->'items') loop
    pid:=(item->>'produk_id')::bigint; q:=(item->>'qty')::integer;
    select round(sum(harga_jual_satuan*qty)/sum(qty),4),round(sum(hpp_snapshot_satuan*qty)/sum(qty),4)
      into price,snap from detail_penjualan where penjualan_id=src.id and produk_id=pid;
    insert into detail_penjualan(penjualan_id,produk_id,qty,harga_jual_satuan,hpp_snapshot_satuan,hpp_total,subtotal_penjualan,laba_kotor)
      values(return_id,pid,q,price,snap,round(q*snap,2),round(q*price,2),
        case when condition='layak_jual' then round(q*(price-snap),2) else round(q*price,2) end)
      returning to_jsonb(detail_penjualan.*) into d;
    details:=details||jsonb_build_array(d);
    if condition='layak_jual' then
      select stok_saat_ini,hpp into stock,old_hpp from produk where id=pid;
      update produk set stok_saat_ini=stock+q,
        hpp=round(((stock*old_hpp)+(q*snap))/(stock+q),4)
        where id=pid;
    end if;
  end loop;
  update penjualan set total_penjualan=rev,total_hpp=case when condition='layak_jual' then cogs else 0 end,
    total_laba_kotor=case when condition='layak_jual' then rev-cogs else rev end where id=return_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'produk_id',(x->>'produk_id')::bigint,'qty',(x->>'qty')::integer,'harga_jual_satuan',p.harga_jual
    )),'[]'::jsonb)
    into sale_items
    from jsonb_array_elements(payload->'items_pengganti') x
    join produk p on p.id=(x->>'produk_id')::bigint;
  sale_result:=post_penjualan(jsonb_build_object(
    'jenis_transaksi','penjualan','tanggal',dt,'channel','Penukaran',
    'no_referensi',no,'catatan','Barang pengganti untuk penukaran '||no||coalesce(': '||(payload->>'alasan'),''),
    'items',sale_items
  ));
  update penjualan set penjualan_asal_id=src.id where id=(sale_result->>'id')::bigint;
  return jsonb_build_object(
    'id',return_id,'nomor_transaksi',no,'penjualan_asal_id',src.id,'total_penjualan_dibatalkan',rev,
    'total_penjualan_pengganti',replacement_total,'selisih_harga',difference,
    'nomor_transaksi_pengganti',sale_result->>'nomor_transaksi','details',details
  );
end $$;

create or replace function post_penyesuaian(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare dt date:=coalesce((payload->>'tanggal')::date,current_date); kind text:=payload->>'jenis';
  reason text:=trim(coalesce(payload->>'alasan','')); refid bigint; no text; hid bigint;
  item jsonb; pid bigint; q integer; stock integer; cost numeric; old_cost numeric; value_total numeric:=0; d jsonb; details jsonb:='[]'::jsonb;
begin
  if kind not in ('write_off_rusak','write_off_kadaluarsa','write_off_hilang','koreksi_kurang','koreksi_lebih','retur_ke_supplier') then raise exception 'Jenis penyesuaian tidak valid'; end if;
  if reason='' then raise exception 'Alasan wajib diisi'; end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then raise exception 'Minimal satu barang harus ditambahkan'; end if;
  if kind='retur_ke_supplier' then
    refid:=(payload->>'pembelian_asal_id')::bigint;
    if refid is null or not exists(select 1 from pembelian where id=refid and status_transaksi='posted') then raise exception 'Retur supplier memerlukan pembelian asal yang aktif'; end if;
  end if;
  perform set_config('app.inventory_rpc','on',true);
  for pid in select distinct (x->>'produk_id')::bigint from jsonb_array_elements(payload->'items') x order by 1 loop
    perform 1 from produk where id=pid and status_aktif for update;
    if not found then raise exception 'Produk tidak ditemukan atau nonaktif'; end if;
  end loop;
  no:=generate_nomor_transaksi('PEN',dt);
  if kind='retur_ke_supplier' then
    for item in select value from jsonb_array_elements(payload->'items') loop
      pid:=(item->>'produk_id')::bigint; q:=(item->>'qty')::integer;
      if q<=0 then raise exception 'Qty retur supplier harus positif'; end if;
      if not exists(select 1 from detail_pembelian where pembelian_id=refid and produk_id=pid) then
        raise exception 'Produk tidak ditemukan pada pembelian asal';
      end if;
      if q > (select coalesce(sum(d.qty),0) from detail_pembelian d where d.pembelian_id=refid and d.produk_id=pid)
        - (select coalesce(sum(abs(d.qty)),0) from detail_penyesuaian d join penyesuaian_persediaan a on a.id=d.penyesuaian_id
           where a.jenis='retur_ke_supplier' and a.status_transaksi='posted' and a.pembelian_asal_id=refid and d.produk_id=pid) then
        raise exception 'Qty retur melebihi jumlah produk pada pembelian asal';
      end if;
    end loop;
  end if;
  insert into penyesuaian_persediaan(nomor_transaksi,tanggal,jenis,alasan,pembelian_asal_id)
    values(no,dt,kind,reason,refid) returning id into hid;
  for item in select value from jsonb_array_elements(payload->'items') loop
    pid:=(item->>'produk_id')::bigint; q:=(item->>'qty')::integer;
    if q=0 then raise exception 'Qty tidak boleh nol'; end if;
    if kind in ('write_off_rusak','write_off_kadaluarsa','write_off_hilang','disposal','donasi','koreksi_kurang') and q>0 then q:=-q; end if;
    if kind in ('koreksi_lebih') and q<0 then q:=abs(q); end if;
    if kind='retur_ke_supplier' then q:=-abs(q); end if;
    select stok_saat_ini,hpp into stock,old_cost from produk where id=pid;
    cost:=old_cost;
    if stock+q<0 then raise exception 'Stok tidak cukup untuk penyesuaian produk %',pid; end if;
    if kind='retur_ke_supplier' then
      select sum(biaya_perolehan_total)/nullif(sum(qty),0) into cost
        from detail_pembelian where pembelian_id=refid and produk_id=pid;
      if abs(q)*cost>stock*old_cost then
        raise exception 'Retur supplier akan menghasilkan nilai persediaan negatif; diperlukan koreksi terdokumentasi';
      end if;
    end if;
    value_total:=value_total+abs(q*cost);
    insert into detail_penyesuaian(penyesuaian_id,produk_id,qty,hpp_snapshot_satuan,nilai_total,catatan)
      values(hid,pid,q,cost,round(abs(q*cost),2),item->>'catatan') returning to_jsonb(detail_penyesuaian.*) into d;
    details:=details||jsonb_build_array(d);
    if kind='retur_ke_supplier' then
      update produk set stok_saat_ini=stock+q,
        hpp=case when stock+q=0 then 0 else round((stock*old_cost-abs(q)*cost)/(stock+q),4) end
        where id=pid;
    else
      update produk set stok_saat_ini=stock+q where id=pid;
    end if;
  end loop;
  update penyesuaian_persediaan set total_nilai=value_total where id=hid;
  return jsonb_build_object('id',hid,'nomor_transaksi',no,'jenis',kind,'total_nilai',value_total,'details',details);
end $$;

create or replace function void_penyesuaian(p_id bigint, p_alasan text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare h penyesuaian_persediaan%rowtype; r record; p produk%rowtype;
begin
  if trim(coalesce(p_alasan,''))='' then raise exception 'Alasan void wajib diisi'; end if;
  select * into h from penyesuaian_persediaan where id=p_id for update;
  if not found or h.status_transaksi<>'posted' then raise exception 'Penyesuaian tidak ditemukan atau sudah void'; end if;
  perform set_config('app.inventory_rpc','on',true);
  for r in select * from detail_penyesuaian where penyesuaian_id=p_id order by produk_id loop
    select * into p from produk where id=r.produk_id for update;
    if exists(select 1 from detail_pembelian d join pembelian x on x.id=d.pembelian_id where d.produk_id=p.id and x.status_transaksi='posted' and x.created_at>h.created_at)
       or exists(select 1 from detail_penjualan d join penjualan x on x.id=d.penjualan_id where d.produk_id=p.id and x.status_transaksi='posted' and x.created_at>h.created_at)
       or exists(select 1 from detail_penyesuaian d join penyesuaian_persediaan x on x.id=d.penyesuaian_id where d.produk_id=p.id and x.id<>p_id and x.status_transaksi='posted' and x.created_at>h.created_at) then
      raise exception 'Void ditolak karena ada pergerakan persediaan setelah penyesuaian; buat transaksi koreksi yang terdokumentasi';
    end if;
    if p.stok_saat_ini-r.qty<0 then raise exception 'Void ditolak karena saldo stok tidak mencukupi'; end if;
  end loop;
  for r in select * from detail_penyesuaian where penyesuaian_id=p_id order by produk_id loop
    if h.jenis='retur_ke_supplier' and r.qty<0 then
      update produk set hpp=case when stok_saat_ini-r.qty=0 then hpp else
        round((stok_saat_ini*hpp+abs(r.qty)*r.hpp_snapshot_satuan)/(stok_saat_ini-r.qty),4) end,
        stok_saat_ini=stok_saat_ini-r.qty where id=r.produk_id;
    else
      update produk set stok_saat_ini=stok_saat_ini-r.qty where id=r.produk_id;
    end if;
  end loop;
  update penyesuaian_persediaan set status_transaksi='void' where id=p_id;
  insert into audit_log(tabel,record_id,aksi,alasan,data_sebelum,data_sesudah)
  values('penyesuaian_persediaan',p_id,'void',p_alasan,to_jsonb(h),(select to_jsonb(x) from penyesuaian_persediaan x where id=p_id));
  return jsonb_build_object('id',p_id,'status_transaksi','void');
end $$;

create or replace function void_pembelian(p_id bigint, alasan text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare h pembelian%rowtype; r record; p produk%rowtype; oldv jsonb;
begin
  if trim(coalesce(alasan,''))='' then raise exception 'Alasan void wajib diisi'; end if;
  select * into h from pembelian where id=p_id for update;
  if not found or h.status_transaksi<>'posted' then raise exception 'Pembelian tidak ditemukan atau sudah void'; end if;
  perform set_config('app.inventory_rpc','on',true);
  for r in select * from detail_pembelian where pembelian_id=p_id order by produk_id loop
    select * into p from produk where id=r.produk_id for update;
    if p.stok_saat_ini<r.qty then raise exception 'Void ditolak: sebagian stok pembelian telah keluar'; end if;
    if exists(select 1 from detail_penjualan d join penjualan x on x.id=d.penjualan_id where d.produk_id=p.id and x.status_transaksi='posted' and x.created_at>h.created_at)
       or exists(select 1 from detail_penyesuaian d join penyesuaian_persediaan x on x.id=d.penyesuaian_id where d.produk_id=p.id and x.status_transaksi='posted' and x.created_at>h.created_at) then
      raise exception 'Void ditolak karena ada pergerakan stok setelah pembelian; buat penyesuaian terdokumentasi';
    end if;
  end loop;
  for r in select * from detail_pembelian where pembelian_id=p_id order by produk_id loop
    select * into p from produk where id=r.produk_id;
    update produk set stok_saat_ini=p.stok_saat_ini-r.qty,
      hpp=case when p.stok_saat_ini-r.qty=0 then 0 else round(((p.stok_saat_ini*p.hpp)-r.biaya_perolehan_total)/(p.stok_saat_ini-r.qty),4) end
      where id=p.id;
  end loop;
  update pembelian set status_transaksi='void' where id=p_id;
  insert into audit_log(tabel,record_id,aksi,alasan,data_sebelum,data_sesudah)
  values('pembelian',p_id,'void',alasan,to_jsonb(h),(select to_jsonb(x) from pembelian x where id=p_id));
  return jsonb_build_object('id',p_id,'status_transaksi','void');
end $$;

create or replace function void_penjualan(p_id bigint, alasan text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare h penjualan%rowtype; r record; p produk%rowtype;
begin
  if trim(coalesce(alasan,''))='' then raise exception 'Alasan void wajib diisi'; end if;
  select * into h from penjualan where id=p_id for update;
  if not found or h.status_transaksi<>'posted' then raise exception 'Transaksi tidak ditemukan atau sudah void'; end if;
  if h.jenis_transaksi='retur_penjualan' then raise exception 'Void retur tidak didukung; lakukan penyesuaian yang terdokumentasi'; end if;
  if h.penjualan_asal_id is not null then
    raise exception 'Transaksi barang pengganti tidak dapat dibatalkan terpisah dari penukaran';
  end if;
  if exists(select 1 from penjualan where penjualan_asal_id=p_id and status_transaksi='posted') then raise exception 'Void ditolak karena transaksi memiliki retur aktif'; end if;
  perform set_config('app.inventory_rpc','on',true);
  for r in select * from detail_penjualan where penjualan_id=p_id order by produk_id loop
    select * into p from produk where id=r.produk_id for update;
    if h.jenis_transaksi='penjualan' then
      update produk set stok_saat_ini=p.stok_saat_ini+r.qty,
        hpp=case when p.stok_saat_ini+r.qty=0 then p.hpp else round(((p.stok_saat_ini*p.hpp)+(r.qty*r.hpp_snapshot_satuan))/(p.stok_saat_ini+r.qty),4) end where id=p.id;
    else update produk set stok_saat_ini=p.stok_saat_ini+r.qty where id=p.id; end if;
  end loop;
  update penjualan set status_transaksi='void' where id=p_id;
  insert into audit_log(tabel,record_id,aksi,alasan,data_sebelum,data_sesudah)
  values('penjualan',p_id,'void',alasan,to_jsonb(h),(select to_jsonb(x) from penjualan x where id=p_id));
  return jsonb_build_object('id',p_id,'status_transaksi','void');
end $$;

create or replace function hitung_kartu_persediaan(p_produk_id bigint, p_tanggal_awal date, p_tanggal_akhir date)
returns table(tanggal date, nomor_transaksi text, sku text, nama_produk text, kategori text, jenis text,
  keterangan text, qty_masuk integer, nilai_masuk numeric, qty_keluar integer, hpp_keluar numeric,
  saldo_qty integer, hpp_rata_rata numeric, saldo_nilai numeric, invoice_path text, produk_id bigint, source_created timestamptz)
language sql stable security definer set search_path=public as $$
  with movements as (
    select b.tanggal,b.nomor_transaksi,d.produk_id,'pembelian'::text jenis,
      'Barang masuk'::text keterangan,d.qty qty_in, d.biaya_perolehan_total nilai_in,0 qty_out,0::numeric cost_out,
      b.created_at created,b.id source_id,b.invoice_path
    from pembelian b join detail_pembelian d on d.pembelian_id=b.id where b.status_transaksi='posted'
    union all
    select b.tanggal,b.nomor_transaksi,d.produk_id,'void'::text,
      'Pembelian dibatalkan'::text,0,0,0,0::numeric,b.created_at,b.id,b.invoice_path
    from pembelian b join detail_pembelian d on d.pembelian_id=b.id where b.status_transaksi='void'
    union all
    select s.tanggal,s.nomor_transaksi,d.produk_id,s.jenis_transaksi,
      coalesce(s.channel,'') keterangan,0,0,d.qty,d.hpp_total,s.created_at,s.id,null
    from penjualan s join detail_penjualan d on d.penjualan_id=s.id
    where s.status_transaksi='posted' and s.jenis_transaksi in ('penjualan','barang_rusak','barang_hilang')
    union all
    select s.tanggal,s.nomor_transaksi,d.produk_id,'void'::text,
      'Transaksi penjualan dibatalkan'::text,0,0,0,0::numeric,s.created_at,s.id,null
    from penjualan s join detail_penjualan d on d.penjualan_id=s.id
    where s.status_transaksi='void' and s.jenis_transaksi in ('penjualan','barang_rusak','barang_hilang')
    union all
    select s.tanggal,s.nomor_transaksi,d.produk_id,'retur_penjualan',
      coalesce(s.alasan_retur,'Retur customer'),case when s.kondisi_barang='layak_jual' then d.qty else 0 end,
      case when s.kondisi_barang='layak_jual' then d.hpp_total else 0 end,0,0,s.created_at,s.id,null
    from penjualan s join detail_penjualan d on d.penjualan_id=s.id where s.status_transaksi='posted' and s.jenis_transaksi='retur_penjualan'
    union all
    select a.tanggal,a.nomor_transaksi,d.produk_id,a.jenis,a.alasan,
      greatest(d.qty,0),case when d.qty>0 then d.nilai_total else 0 end,greatest(-d.qty,0),case when d.qty<0 then d.nilai_total else 0 end,
      a.created_at,a.id,null
    from penyesuaian_persediaan a join detail_penyesuaian d on d.penyesuaian_id=a.id where a.status_transaksi='posted'
    union all
    select a.tanggal,a.nomor_transaksi,d.produk_id,'void'::text,
      'Penyesuaian dibatalkan: '||a.alasan,0,0,0,0::numeric,a.created_at,a.id,null
    from penyesuaian_persediaan a join detail_penyesuaian d on d.penyesuaian_id=a.id where a.status_transaksi='void'
  ),   filtered as (
    select m.*,p.sku,p.nama,k.nama kategori_name
    from movements m join produk p on p.id=m.produk_id join kategori k on k.id=p.kategori_id
    where (p_produk_id is null or m.produk_id=p_produk_id)
      and (p_tanggal_akhir is null or m.tanggal<=p_tanggal_akhir)
  ), balances as (
    select f.*,sum(qty_in-qty_out) over(partition by produk_id order by tanggal,created,source_id,nomor_transaksi rows unbounded preceding) bal_qty,
      sum(nilai_in-cost_out) over(partition by produk_id order by tanggal,created,source_id,nomor_transaksi rows unbounded preceding) bal_value
    from filtered f
  )
  select tanggal,nomor_transaksi,sku,nama,kategori_name,jenis,keterangan,qty_in,nilai_in,qty_out,cost_out,
    bal_qty::integer,case when bal_qty=0 then 0 else round(bal_value/bal_qty,4) end,bal_value,invoice_path,produk_id,created
  from balances where p_tanggal_awal is null or tanggal>=p_tanggal_awal
  order by tanggal,created,source_id,produk_id
$$;

create or replace function save_pengaturan(payload jsonb) returns setof pengaturan
language plpgsql security definer set search_path=public as $$
declare k text; v jsonb;
begin
  for k,v in select key,value from jsonb_each(payload) loop
    insert into pengaturan(key,value,tipe)
      values(k,case when jsonb_typeof(v)='string' then v#>>'{}' else v::text end,
        case when jsonb_typeof(v)='number' then 'number' else 'string' end)
    on conflict(key) do update set value=excluded.value,updated_at=now();
  end loop;
  return query select * from pengaturan order by key;
end $$;

create or replace function hitung_harga_produk(p_id bigint, p_margin numeric, p_update boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p produk%rowtype; price numeric;
begin
  if p_margin<0 or p_margin>=100 then raise exception 'Margin harus antara 0 dan kurang dari 100'; end if;
  select * into p from produk where id=p_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if p.hpp<=0 then raise exception 'Tambahkan barang masuk dulu untuk auto-hitung.'; end if;
  if p_margin<=0 then raise exception 'Margin target harus lebih besar dari nol'; end if;
  price:=round(p.hpp/(1-p_margin/100),2);
  if p_update then update produk set harga_jual=price,margin_target=p_margin,last_price_hpp=p.hpp where id=p_id; end if;
  return jsonb_build_object('produk_id',p_id,'hpp',p.hpp,'margin_target',p_margin,'harga_jual',price);
end $$;

create or replace function bulk_set_margin(p_ids bigint[], p_margin numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p produk%rowtype; results jsonb:='[]'::jsonb; price numeric;
begin
  if p_margin<0 or p_margin>=100 then raise exception 'Margin harus antara 0 dan kurang dari 100'; end if;
  if coalesce(array_length(p_ids,1),0)=0 then raise exception 'Pilih minimal satu produk'; end if;
  perform set_config('app.inventory_rpc','on',true);
  for p in select * from produk where id=any(p_ids) order by id for update loop
    if p.hpp>0 and p_margin>0 then
      price:=round(p.hpp/(1-p_margin/100),2);
      update produk set margin_target=p_margin,harga_jual=price,last_price_hpp=p.hpp where id=p.id;
      results:=results||jsonb_build_array(jsonb_build_object('produk_id',p.id,'status','updated','harga_jual',price));
    else
      update produk set margin_target=p_margin where id=p.id;
      results:=results||jsonb_build_array(jsonb_build_object('produk_id',p.id,'status','hpp_zero','harga_jual',null));
    end if;
  end loop;
  return results;
end $$;

create or replace function dashboard_report(p_awal date, p_akhir date) returns jsonb
language sql stable security definer set search_path=public as $$
  with settings as (
    select coalesce((max(value) filter(where key='threshold_dead_stock_hari'))::integer,90) dead_days,
      coalesce((max(value) filter(where key='threshold_slow_moving_hari'))::integer,60) slow_days
    from pengaturan
  ), inventory as (
    select p.*,k.nama kategori_nama from produk p join kategori k on k.id=p.kategori_id
  ), period_heads as (
    select * from penjualan where status_transaksi='posted' and tanggal between p_awal and p_akhir
  ), sales_totals as (
    select coalesce(sum(case when jenis_transaksi='penjualan' then total_penjualan
      when jenis_transaksi='retur_penjualan' then -total_penjualan else 0 end),0) omzet,
      coalesce(sum(case when jenis_transaksi='penjualan' then total_hpp
      when jenis_transaksi='retur_penjualan' then -total_hpp else 0 end),0) hpp
    from period_heads
  ), profit_product as (
    select d.produk_id,sum(case when h.jenis_transaksi='retur_penjualan' then -d.laba_kotor else d.laba_kotor end) laba
    from period_heads h join detail_penjualan d on d.penjualan_id=h.id
    where h.jenis_transaksi in ('penjualan','retur_penjualan') group by d.produk_id
  ), pie as (
    select kategori_nama nama,sum(stok_saat_ini*hpp) nilai from inventory group by kategori_nama
  ), alert_min as (
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'nama',nama,'sku',sku,'stok_saat_ini',stok_saat_ini,'stok_minimum',stok_minimum)),'[]'::jsonb) data
    from inventory where stok_saat_ini<=stok_minimum
  ), alert_dead as (
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'nama',i.nama,'sku',i.sku,'stok_saat_ini',i.stok_saat_ini)),'[]'::jsonb) data
    from inventory i cross join settings s
    where i.stok_saat_ini>0 and current_date-coalesce(i.last_out_date,i.created_at::date)>=s.dead_days
  ), alert_slow as (
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'nama',i.nama,'sku',i.sku,'stok_saat_ini',i.stok_saat_ini)),'[]'::jsonb) data
    from inventory i cross join settings s
    where i.stok_saat_ini>0 and i.last_out_date is not null
      and current_date-i.last_out_date>=s.slow_days
      and current_date-i.last_out_date<s.dead_days
  ), recent_purchases as (
    select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'nomor_transaksi',b.nomor_transaksi,'tanggal',b.tanggal,
      'total_biaya_perolehan',b.total_biaya_perolehan,'supplier',jsonb_build_object('nama',s.nama))
      order by b.tanggal desc,b.created_at desc,b.id desc),'[]'::jsonb) data
    from (select * from pembelian where status_transaksi='posted' order by tanggal desc,created_at desc,id desc limit 5) b
    join supplier s on s.id=b.supplier_id
  ), recent_sales as (
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'nomor_transaksi',nomor_transaksi,'tanggal',tanggal,'channel',channel,'total_penjualan',total_penjualan)
      order by tanggal desc,created_at desc,id desc),'[]'::jsonb) data
    from (select * from penjualan where status_transaksi='posted' and jenis_transaksi='penjualan'
      order by tanggal desc,created_at desc,id desc limit 5) x
  ), top_rows as (
    select p.id,p.sku,p.nama,p.stok_saat_ini,pp.laba from profit_product pp join produk p on p.id=pp.produk_id
    order by pp.laba desc,p.id limit 5
  )
  select jsonb_build_object(
    'kpi',jsonb_build_object('omzet',st.omzet,'laba_kotor',st.omzet-st.hpp,
      'margin',case when st.omzet=0 then 0 else (st.omzet-st.hpp)/st.omzet*100 end,
      'jumlah_produk',(select count(*) from produk where status_aktif),
      'total_unit',(select coalesce(sum(stok_saat_ini),0) from produk),
      'nilai_persediaan',(select coalesce(sum(stok_saat_ini*hpp),0) from produk)),
    'alert',jsonb_build_object('stok_minimum',(select data from alert_min),'dead_stock',(select data from alert_dead),'slow_moving',(select data from alert_slow)),
    'pembelian_terbaru',(select data from recent_purchases),'penjualan_terbaru',(select data from recent_sales),
    'top_produk',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sku',sku,'nama',nama,'stok_saat_ini',stok_saat_ini,'profit',laba)) from top_rows),'[]'::jsonb),
    'pie',coalesce((select jsonb_agg(jsonb_build_object('nama',nama,'nilai',nilai) order by nilai desc) from pie),'[]'::jsonb))
  from sales_totals st
$$;

create or replace function analisis_hpp_report(p_awal date, p_akhir date) returns jsonb
language sql stable security definer set search_path=public as $$
  with period_heads as (
    select * from penjualan where status_transaksi='posted' and tanggal between p_awal and p_akhir
  ), sales_heads as (
    select * from period_heads where jenis_transaksi in ('penjualan','retur_penjualan')
  ), totals as (
    select coalesce(sum(case when jenis_transaksi='penjualan' then total_penjualan else -total_penjualan end),0) omzet,
      coalesce(sum(case when jenis_transaksi='penjualan' then total_hpp else -total_hpp end),0) hpp,
      coalesce(sum(case when jenis_transaksi='penjualan' then 1 else -1 end),0) tx_units
    from sales_heads
  ), product_contribution as (
    select d.produk_id,
      sum(case when h.jenis_transaksi='penjualan' then d.qty else -d.qty end) qty,
      sum(case when h.jenis_transaksi='penjualan' then d.subtotal_penjualan else -d.subtotal_penjualan end) omzet,
      sum(case when h.jenis_transaksi='penjualan' then d.hpp_total
        when h.kondisi_barang='layak_jual' then -d.hpp_total else 0 end) hpp,
      sum(case when h.jenis_transaksi='penjualan' then d.laba_kotor else -d.laba_kotor end) laba
    from sales_heads h join detail_penjualan d on d.penjualan_id=h.id group by d.produk_id
  ), contribution_json as (
    select coalesce(jsonb_agg(jsonb_build_object('qty',pc.qty,'omzet',pc.omzet,'hpp',pc.hpp,'laba',pc.laba,
      'margin',case when pc.omzet=0 then 0 else pc.laba/pc.omzet*100 end,
      'produk',jsonb_build_object('id',p.id,'sku',p.sku,'nama',p.nama,'kategori',jsonb_build_object('nama',k.nama)))
      order by pc.laba desc)
      ,'[]'::jsonb) data
    from product_contribution pc join produk p on p.id=pc.produk_id join kategori k on k.id=p.kategori_id
  ), stock_category as (
    select k.nama,sum(p.stok_saat_ini*p.hpp) nilai from produk p join kategori k on k.id=p.kategori_id group by k.nama
  ), review as (
    select p.id,p.sku,p.nama,p.hpp,p.harga_jual,p.margin_target,
      case when p.harga_jual=0 then 0 else (p.harga_jual-p.hpp)/p.harga_jual*100 end actual,
      p.last_price_hpp,k.nama kategori_nama
    from produk p join kategori k on k.id=p.kategori_id
    where p.status_aktif and p.harga_jual>0
      and ((p.harga_jual-p.hpp)/p.harga_jual*100 < p.margin_target-5
        or (p.harga_jual-p.hpp)/p.harga_jual*100 < 15)
  ), loss_adjustment as (
    select jenis,sum(total_nilai) nilai from penyesuaian_persediaan
    where status_transaksi='posted' and tanggal between p_awal and p_akhir
      and jenis not in ('retur_ke_supplier','koreksi_lebih') group by jenis
  ), damage_loss as (
    select h.jenis_transaksi jenis,sum(d.hpp_total) nilai from penjualan h
    join detail_penjualan d on d.penjualan_id=h.id
    where h.status_transaksi='posted' and h.jenis_transaksi in ('barang_rusak','barang_hilang')
      and h.tanggal between p_awal and p_akhir group by h.jenis_transaksi
  ), return_loss as (
    select coalesce(sum(d.hpp_total),0) nilai from penjualan h join detail_penjualan d on d.penjualan_id=h.id
    where h.status_transaksi='posted' and h.jenis_transaksi='retur_penjualan'
      and h.kondisi_barang='tidak_layak_jual' and h.tanggal between p_awal and p_akhir
  ), inventory_total as (
    select coalesce(sum(stok_saat_ini*hpp),0) nilai from produk
  ), sum_json as (
    select coalesce(jsonb_object_agg(jenis,nilai),'{}'::jsonb) data from (
      select jenis,nilai from loss_adjustment union all select jenis,nilai from damage_loss
      union all select 'retur_tidak_layak',nilai from return_loss
    ) x
  )
  select jsonb_build_object(
    'ringkasan',jsonb_build_object('omzet_bersih',t.omzet,'hpp_penjualan_bersih',t.hpp,'laba_kotor',t.omzet-t.hpp,
      'margin',case when t.omzet=0 then 0 else (t.omzet-t.hpp)/t.omzet*100 end,
      'markup',case when t.hpp=0 then 0 else (t.omzet-t.hpp)/t.hpp*100 end,
      'unit_terjual',coalesce((select sum(case when h.jenis_transaksi='penjualan' then d.qty else -d.qty end)
        from sales_heads h join detail_penjualan d on d.penjualan_id=h.id),0),
      'nilai_persediaan',it.nilai),
    'persediaan_kategori',coalesce((select jsonb_agg(jsonb_build_object('nama',nama,'nilai',nilai) order by nilai desc) from stock_category),'[]'::jsonb),
    'kontribusi_produk',(select data from contribution_json),
    'evaluasi_margin',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sku',sku,'nama',nama,'hpp',hpp,
       'harga_jual',harga_jual,'margin_target',margin_target,'margin_aktual_indikatif',actual,
       'last_price_hpp',last_price_hpp,'kategori',jsonb_build_object('nama',kategori_nama))
       order by actual asc) from review),'[]'::jsonb),
    'kerugian',(select data from sum_json))
  from totals t cross join inventory_total it
$$;

create or replace function performa_kategori_report(p_level text default 'induk') returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('nama',nama,'produk',produk,'nilai_persediaan',nilai) order by nilai desc),'[]'::jsonb)
  from (
    select case when p_level='subkategori' then k.nama else coalesce(parent.nama,k.nama) end nama,
      count(*) produk,sum(p.stok_saat_ini*p.hpp) nilai
    from produk p join kategori k on k.id=p.kategori_id left join kategori parent on parent.id=k.parent_id
    group by case when p_level='subkategori' then k.nama else coalesce(parent.nama,k.nama) end
  ) x
$$;

create or replace function produk_margin_review(p_ignored bigint[] default '{}') returns jsonb
language sql stable security definer set search_path=public as $$
  with settings as (
    select coalesce(max(value) filter(where key='minimal_qty_evaluasi_margin'),'3')::integer min_qty from pengaturan
  ), sales as (
    select d.produk_id,
      sum(case when h.jenis_transaksi='penjualan' then d.qty else -d.qty end)::integer qty_terjual,
      sum(case when h.jenis_transaksi='penjualan' then d.subtotal_penjualan else -d.subtotal_penjualan end) omzet,
      sum(case when h.jenis_transaksi='penjualan' then d.hpp_total
        when h.kondisi_barang='layak_jual' then -d.hpp_total else 0 end) hpp
    from detail_penjualan d join penjualan h on h.id=d.penjualan_id
    where h.status_transaksi='posted' and h.jenis_transaksi in ('penjualan','retur_penjualan')
    group by d.produk_id
  ), scored as (
    select p.*,k.nama kategori_nama,k.kode kategori_kode,
      coalesce(s.qty_terjual,0) qty_terjual,settings.min_qty,
      case when coalesce(s.qty_terjual,0)>=settings.min_qty and coalesce(s.omzet,0)<>0
        then (s.omzet-s.hpp)/s.omzet*100 else null end margin_transaksi,
      (p.harga_jual-p.hpp)/nullif(p.harga_jual,0)*100 margin_harga_sekarang,
      case when coalesce(p.last_price_hpp,0)>0 then abs(p.hpp-p.last_price_hpp)/p.last_price_hpp*100 else 0 end hpp_change
    from produk p join kategori k on k.id=p.kategori_id
    cross join settings left join sales s on s.produk_id=p.id
    where p.status_aktif and p.hpp>0 and not(p.id=any(coalesce(p_ignored,'{}'::bigint[])))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'sku',sku,'nama',nama,'kategori',jsonb_build_object('nama',kategori_nama,'kode',kategori_kode),
    'hpp',hpp,'harga_jual',harga_jual,'margin_target',margin_target,'last_price_hpp',last_price_hpp,
    'qty_terjual',qty_terjual,'minimal_qty_evaluasi',min_qty,
    'margin_aktual_indikatif',margin_transaksi,'margin_harga_sekarang',margin_harga_sekarang,'perubahan_hpp_persen',hpp_change,
    'alerts',to_jsonb(array_remove(array[
      case when hpp_change>10 then 'hpp_berubah' end,
      case when margin_transaksi<margin_target-5 then 'di_bawah_target' end,
      case when margin_transaksi<15 then 'margin_rendah' end
    ],null))) order by margin_transaksi nulls last),'[]'::jsonb)
  from scored where hpp_change>10 or margin_transaksi<margin_target-5 or margin_transaksi<15
$$;

create or replace function analisis_periodik_report(p_type text, p_year integer default null) returns jsonb
language sql stable security definer set search_path=public as $$
  with posted as (
    select tanggal,jenis_transaksi,total_penjualan,total_hpp
    from penjualan where status_transaksi='posted' and jenis_transaksi in ('penjualan','retur_penjualan')
      and (p_type='tahunan' or extract(year from tanggal)=coalesce(p_year,extract(year from current_date)::integer))
  ), years as (
    select generate_series(least(coalesce((select min(extract(year from tanggal))::integer from posted),coalesce(p_year,extract(year from current_date)::integer)),coalesce(p_year,extract(year from current_date)::integer)),
      greatest(coalesce((select max(extract(year from tanggal))::integer from posted),coalesce(p_year,extract(year from current_date)::integer)),coalesce(p_year,extract(year from current_date)::integer)))::integer tahun
  ), periods as (
    select case when p_type='bulanan' then
        case g.idx when 1 then 'Jan' when 2 then 'Feb' when 3 then 'Mar' when 4 then 'Apr'
          when 5 then 'Mei' when 6 then 'Jun' when 7 then 'Jul' when 8 then 'Agu'
          when 9 then 'Sep' when 10 then 'Okt' when 11 then 'Nov' else 'Des' end
      when p_type='triwulanan' then 'Q'||g.idx
      when p_type='semester' then 'S'||g.idx else y.tahun::text end label,
      case when p_type='tahunan' then y.tahun else g.idx end idx,
      case when p_type='tahunan' then y.tahun else coalesce(p_year,extract(year from current_date)::integer) end tahun
    from years y cross join lateral generate_series(1,case p_type when 'bulanan' then 12 when 'triwulanan' then 4 when 'semester' then 2 else 1 end) as g(idx)
  ), aggregates as (
    select extract(year from x.tanggal)::integer tahun,
      case when p_type='tahunan' then extract(year from x.tanggal)::integer
      when p_type='bulanan' then extract(month from x.tanggal)::integer
      when p_type='triwulanan' then ceil(extract(month from x.tanggal)/3.0)::integer
      else ceil(extract(month from x.tanggal)/6.0)::integer end idx,
      sum(case when x.jenis_transaksi='penjualan' then x.total_penjualan else -x.total_penjualan end) omzet,
      sum(case when x.jenis_transaksi='penjualan' then x.total_hpp else -x.total_hpp end) hpp
    from posted x group by tahun,idx
  ), raw as (
    select p.label,p.tahun,p.idx,coalesce(a.omzet,0) omzet,coalesce(a.hpp,0) hpp
    from periods p left join aggregates a on a.tahun=p.tahun and a.idx=p.idx
  ), with_growth as (
    select *,omzet-hpp laba,case when omzet=0 then 0 else (omzet-hpp)/omzet*100 end margin,
      lag(omzet) over(order by tahun,idx) prev_omzet,lag(omzet-hpp) over(order by tahun,idx) prev_profit
    from raw
  )
  select coalesce(jsonb_agg(jsonb_build_object('label',label,'tahun',tahun,'omzet',omzet,'hpp',hpp,'laba',laba,'margin',margin,
    'pertumbuhan_omzet',case when coalesce(prev_omzet,0)=0 then 0 else (omzet-prev_omzet)/prev_omzet*100 end,
    'pertumbuhan_laba',case when coalesce(prev_profit,0)=0 then 0 else (laba-prev_profit)/abs(prev_profit)*100 end)
    order by tahun,idx),'[]'::jsonb)
  from with_growth
$$;

insert into kategori(parent_id,nama,kode,butuh_ukuran,urutan)
values(null,'Atasan','ATASAN',false,1),(null,'Bawahan','BAWAHAN',false,2),(null,'Botol Minum','BOTOL',false,3),
 (null,'Aksesoris','AKSESORIS',false,4),(null,'Alat Tulis','ATLATULIS',false,5),(null,'Lainnya','LAINNYA',false,6)
on conflict(kode) do nothing;
insert into kategori(parent_id,nama,kode,butuh_ukuran,urutan)
select p.id,v.nama,v.kode,v.ukuran,v.urutan from (values
 ('Atasan','Kaos Lengan Pendek','KAOSP',true,1),('Atasan','Kaos Lengan Panjang','KAOSL',true,2),('Atasan','Polo','POLO',true,3),('Atasan','Hoodie','HODI',true,4),
 ('Bawahan','Celana Panjang','CELP',true,5),('Bawahan','Celana Pendek','CELPEN',true,6),('Botol Minum','Botol Plastik','BOTP',true,7),('Botol Minum','Botol Stainless','BOTS',true,8),
 ('Aksesoris','Topi','TOPI',false,9),('Aksesoris','Tote Bag','TOTB',false,10),('Aksesoris','Pin','PIN',false,11),
 ('Alat Tulis','Pulpen','PULP',false,12),('Alat Tulis','Notebook','NOTE',false,13),('Lainnya','Lainnya','LAIN',false,14)
) as v(parent_name,nama,kode,ukuran,urutan)
join kategori p on p.nama=v.parent_name and p.parent_id is null
on conflict(kode) do nothing;
insert into ukuran(kategori_id,nilai,urutan)
select c.id,x.nilai,x.ord from kategori c cross join lateral unnest(
 case c.kode when 'KAOSP' then array['S','M','L','XL','XXL','XXXL']
 when 'KAOSL' then array['S','M','L','XL','XXL','XXXL'] when 'POLO' then array['S','M','L','XL','XXL','XXXL']
 when 'HODI' then array['S','M','L','XL','XXL','XXXL'] when 'CELP' then array['28','30','32','34','36']
 when 'CELPEN' then array['28','30','32','34','36'] when 'BOTP' then array['500ml','750ml','1L']
 when 'BOTS' then array['350ml','500ml','750ml','1L'] else array[]::text[] end
) with ordinality x(nilai,ord)
on conflict(kategori_id,nilai) do nothing;
insert into pengaturan(key,value,tipe,deskripsi) values
 ('nama_toko','Wonder Merch','string','Nama toko pada nota'),
 ('alamat_toko','','string','Alamat toko'),
 ('telepon_toko','','string','Nomor telepon toko'),
 ('email_toko','','string','Email toko'),
 ('footer_nota','Terima kasih telah berbelanja!','string','Footer nota'),
 ('batas_hari_retur','2','integer','Batas tetap penukaran barang customer dalam hari'),
 ('threshold_dead_stock_hari','90','integer','Ambang dead stock dalam hari'),
 ('threshold_slow_moving_hari','60','integer','Ambang slow-moving dalam hari'),
 ('minimal_qty_evaluasi_margin','3','integer','Minimum qty untuk evaluasi margin')
on conflict(key) do nothing;
update pengaturan set value='2',tipe='integer',deskripsi='Batas tetap penukaran barang customer dalam hari'
where key='batas_hari_retur';

alter table kategori enable row level security;
alter table ukuran enable row level security;
alter table supplier enable row level security;
alter table produk enable row level security;
alter table pembelian enable row level security;
alter table detail_pembelian enable row level security;
alter table penjualan enable row level security;
alter table detail_penjualan enable row level security;
alter table penyesuaian_persediaan enable row level security;
alter table detail_penyesuaian enable row level security;
alter table pengaturan enable row level security;
alter table audit_log enable row level security;
alter table nomor_harian enable row level security;
alter table sku_counter enable row level security;
-- DEVELOPMENT-ONLY anon access. Do not deploy these policies to production.
do $$ declare t text; begin
 foreach t in array array['kategori','ukuran','supplier','produk','pengaturan']
 loop
   execute format('drop policy if exists dev_anon_all on %I',t);
   execute format('create policy dev_anon_all on %I for all to anon using (true) with check (true)',t);
 end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select,insert,update,delete on all tables in schema public to anon, authenticated;
grant usage,select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
-- Direct transaction-table writes are denied; atomic SECURITY DEFINER RPCs own those writes.
do $$ declare t text; begin
 foreach t in array array['pembelian','detail_pembelian','penjualan','detail_penjualan','penyesuaian_persediaan','detail_penyesuaian']
 loop
   execute format('drop policy if exists dev_anon_all on %I',t);
   execute format('drop policy if exists dev_anon_read on %I',t);
   execute format('create policy dev_anon_read on %I for select to anon using (true)',t);
   execute format('revoke insert,update,delete on %I from anon,authenticated',t);
 end loop;
end $$;
drop policy if exists dev_anon_all on audit_log;
drop policy if exists dev_anon_all on nomor_harian;
drop policy if exists dev_anon_all on sku_counter;
revoke all on audit_log,nomor_harian,sku_counter from anon,authenticated;

-- The statements below create the two public Storage buckets. Public means URL possession
-- grants read access; use authenticated policies and signed URLs for production.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('produk-images','produk-images',true,2097152,array['image/jpeg','image/png'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png'];
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('invoices','invoices',true,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];
drop policy if exists dev_public_storage_read on storage.objects;
create policy dev_public_storage_read on storage.objects for select to anon,authenticated
using (bucket_id in ('produk-images','invoices'));
drop policy if exists dev_anon_storage_upload on storage.objects;
create policy dev_anon_storage_upload on storage.objects for insert to anon,authenticated
with check (bucket_id in ('produk-images','invoices'));
drop policy if exists dev_anon_storage_delete on storage.objects;
create policy dev_anon_storage_delete on storage.objects for delete to anon,authenticated
using (bucket_id in ('produk-images','invoices'));
