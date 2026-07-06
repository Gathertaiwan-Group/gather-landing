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

-- 部落格（hermes agent 透過 /api/blog 上架文章）
create table if not exists blog_posts (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  excerpt     text,
  content     text,                    -- Markdown
  cover_url   text,
  category    text,                    -- '數位行銷' | 'AI 賦能'
  author      text default '給樂數位 Gather',
  published   boolean default false,
  published_at timestamptz,
  created_at  timestamptz default now()
);
create index if not exists blog_posts_pub_idx on blog_posts (published, published_at desc);

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

-- ─────────────────────────────────────────────────────────────
-- 後台 (Admin Dashboard) — /admin
-- 三張表全部啟用 RLS 且「不建任何 public policy」→ 只有 service_role
-- （createAdminSupabase）能存取；anon / 瀏覽器一律讀不到。
-- ─────────────────────────────────────────────────────────────

-- AI 客服對話紀錄：以 session_id 為單位 upsert，一段對話一列
create table if not exists ai_chat_logs (
  id             uuid primary key default gen_random_uuid(),
  session_id     text unique not null,               -- ChatWidget crypto.randomUUID()
  messages       jsonb not null default '[]'::jsonb, -- 完整對話 [{role,text}]
  message_count  int  not null default 0,
  first_question text,                               -- 首則使用者提問（清單預覽）
  last_reply     text,                               -- 最新 AI 回覆（清單預覽）
  user_ip        text,
  user_agent     text,
  -- AI 從對話中萃取的聯絡資訊與需求（自然引導＋Gemini 結構化萃取）
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  contact_line   text,
  summary        text,                              -- 一句需求摘要
  intent         text,                              -- 意向（詢價／合作意向／一般諮詢…）
  has_contact    boolean generated always as
                   (coalesce(contact_name, contact_phone, contact_email, contact_line) is not null) stored,
  notified       boolean not null default false,      -- 已寄新諮詢通知？（避免同段對話重複寄）
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists ai_chat_logs_session_idx on ai_chat_logs (session_id);
create index if not exists ai_chat_logs_updated_idx on ai_chat_logs (updated_at desc);
create index if not exists ai_chat_logs_contact_idx on ai_chat_logs (has_contact, updated_at desc);

-- AI 實驗室工具試用紀錄（潛客訊號）
create table if not exists ai_tool_logs (
  id         uuid primary key default gen_random_uuid(),
  tool       text not null,          -- copy | automation | segment | insight | recommend
  input      text,
  user_ip    text,
  created_at timestamptz not null default now()
);
create index if not exists ai_tool_logs_created_idx on ai_tool_logs (created_at desc);

-- 案件管理（手動維護的案件看板）
create table if not exists client_cases (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                 -- 案件名稱
  client_name   text not null,                 -- 客戶/公司
  contact_email text,
  contact_phone text,
  contact_line  text,
  source        text not null default 'manual', -- line | ai_chat | referral | manual
  status        text not null default '洽談中',  -- 洽談中|報價中|進行中|已完成|已結案|擱置（app 端 allowlist）
  budget        numeric,
  currency      text default 'TWD',
  notes         text,
  session_id    text,                          -- 若由某段對話建立，回連 ai_chat_logs.session_id
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists client_cases_status_idx  on client_cases (status);
create index if not exists client_cases_updated_idx on client_cases (updated_at desc);

-- RLS：全部啟用、不建任何 public policy（只有 service_role 能存取）
alter table ai_chat_logs enable row level security;
alter table ai_tool_logs enable row level security;
alter table client_cases  enable row level security;
