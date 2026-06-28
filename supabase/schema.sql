-- 給樂數位 Gather — Supabase 資料表 schema
-- 在 Supabase Dashboard → SQL Editor 執行，或啟用專案後由 CLI 套用。
-- 對應 design_handoff_gather_website/README.md §8。

-- 作品集
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,           -- 例：企業形象官網
  name        text not null,           -- 例：聯成外語線上語言學校
  url         text not null,
  image_url   text,                    -- Supabase Storage 截圖
  sort_order  int  default 0,
  published   boolean default true,
  created_at  timestamptz default now()
);

-- 聯絡表單
create table if not exists contact_submissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  message     text not null,
  source      text default 'website',
  notified    boolean default false,
  created_at  timestamptz default now()
);

-- （選配）部落格
create table if not exists blog_posts (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  excerpt     text,
  content     text,
  cover_url   text,
  published   boolean default false,
  published_at timestamptz,
  created_at  timestamptz default now()
);

-- RLS：公開讀已發佈內容；寫入僅限 service_role / 後台登入
alter table projects enable row level security;
alter table blog_posts enable row level security;
alter table contact_submissions enable row level security;

drop policy if exists "public read published projects" on projects;
create policy "public read published projects"
  on projects for select using (published = true);

drop policy if exists "public read published posts" on blog_posts;
create policy "public read published posts"
  on blog_posts for select using (published = true);

drop policy if exists "anyone can submit contact" on contact_submissions;
create policy "anyone can submit contact"
  on contact_submissions for insert with check (true);

-- 預設作品集資料（與內建 fallback 一致；之後可於後台/Studio 維護）
insert into projects (category, name, url, sort_order) values
  ('企業形象官網', '聯成外語線上語言學校', 'https://www.abcgo.com.tw/', 1),
  ('企業電商官網', '台灣宮廷酒廠', 'https://go.palacetwshop.com/', 2),
  ('企業形象官網', '工富家飾', 'https://kcasa.pro/', 3),
  ('企業形象官網', '松澄會計師事務所', 'https://songchencpa.odoo.com/', 4),
  ('部落客', 'Three of Us', 'https://loveccdd.com/', 5),
  ('線上課程網站', '台灣環境生態護育產業工會', 'https://beunion.tw/', 6)
on conflict do nothing;
