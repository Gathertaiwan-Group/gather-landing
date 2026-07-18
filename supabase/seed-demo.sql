-- ═════════════════════════════════════════════════════════════════
-- 示範資料（seed-demo）— 僅 demo／展示環境用，正式環境勿跑！
-- ═════════════════════════════════════════════════════════════════
-- 用途：白牌展示環境一鍵灌入「看得到東西」的資料——
--   ①3 個作品集、②1 篇部落格文章、③1 條完整案件鏈
--     （報價已接受 → 合約已簽 → 訂金已付 → 案件進行中
--       → 2 個里程碑 → 1 個已交付交付物 → 2 則專案動態）。
-- 前置：先跑完 supabase/schema.sql。
-- 特性：所有列都用固定 UUID＋on conflict do nothing → 重跑安全（不會重複）。
-- 展示入口（token 固定字串，方便 demo 時直接開網址）：
--   報價單  /quote/demo-quote-token      （狀態 accepted）
--   合約    /contract/demo-contract-token（狀態 signed）
--   請款單  /pay/demo-pay-deposit        （狀態 paid）
--   客戶入口 /portal/demo-portal-token   （進度、里程碑、交付物、留言）
-- 聯絡資訊一律用保留網域 demo@example.com，不會寄到真人信箱。

-- ── ① 作品集（generic 名稱；sort_order 從 101 起，避免蓋過正式作品排序）──
insert into projects (id, category, name, url, sort_order, published) values
  ('d0000000-0000-4000-8000-000000000101', '企業形象官網', '示範作品：品牌形象網站', 'https://example.com/brand',   101, true),
  ('d0000000-0000-4000-8000-000000000102', '企業電商官網', '示範作品：線上商店',     'https://example.com/shop',    102, true),
  ('d0000000-0000-4000-8000-000000000103', '預約系統',     '示範作品：預約管理系統', 'https://example.com/booking', 103, true)
on conflict do nothing;

-- ── ② 部落格文章（作者用中性名稱，不綁品牌）──
insert into blog_posts (id, slug, title, excerpt, content, category, author, published, published_at) values
  (
    'd0000000-0000-4000-8000-000000000201',
    'demo-welcome',
    '示範文章：用內容行銷累積長期流量',
    '這是一篇示範文章，展示部落格模組的列表、分類與 Markdown 內文渲染。',
    E'## 為什麼要經營內容\n\n這是一篇**示範文章**，用來展示部落格模組的完整外觀：\n\n- 列表頁 `/blog` 與分類篩選\n- 文章頁 `/blog/[slug]` 的 Markdown 渲染\n- 首頁「最新文章」區塊\n\n## 怎麼發文\n\n後台可透過 `POST /api/blog`（Bearer token）自動上架文章，支援排程發佈。\n\n> 正式環境請把這篇示範文章下架或刪除。',
    '數位行銷',
    '網站團隊',
    true,
    now() - interval '1 day'
  )
on conflict do nothing;

-- ── ③ 完整案件鏈（示範客戶 demo@example.com）──

-- ③-1 報價單：已寄送→已讀→已接受（quote_no 由 default 序號自動產生，勿手塞）
insert into quotes (
  id, client_name, contact_email, status, currency,
  line_items, subtotal, tax, total, notes,
  valid_days, valid_until, public_token, created_by,
  sent_at, viewed_at, accepted_at
) values (
  'd0000000-0000-4000-8000-000000000401',
  '示範客戶',
  'demo@example.com',
  'accepted',
  'TWD',
  '[
    {"description": "官網視覺設計與前端開發", "qty": 1, "unit_price": 60000, "amount": 60000},
    {"description": "後台管理系統", "qty": 1, "unit_price": 40000, "amount": 40000}
  ]'::jsonb,
  100000,
  5000,
  105000,
  '（示範資料）此報價單用於展示公開報價頁與接受流程。',
  14,
  now() + interval '7 days',
  'demo-quote-token',
  'manual',
  now() - interval '10 days',
  now() - interval '9 days',
  now() - interval '9 days'
) on conflict do nothing;

-- ③-2 合約：已簽署（contract_no 由 default 序號自動產生；簽名證跡用文件保留 IP 203.0.113.10）
insert into contracts (
  id, case_id, quote_id, client_name, contact_email,
  content_md, status, public_token,
  sent_at, signed_at, signer_name, signer_ip, signer_user_agent
) values (
  'd0000000-0000-4000-8000-000000000501',
  'd0000000-0000-4000-8000-000000000301',
  'd0000000-0000-4000-8000-000000000401',
  '示範客戶',
  'demo@example.com',
  E'# 軟體委託開發服務合約（示範）\n\n- 委託方（甲方）：示範客戶\n- 受託方（乙方）：（貴公司名稱）\n\n甲方委託乙方進行「示範官網建置案」之開發服務，總價 NT$105,000（含稅）。\n\n## 付款方式\n\n1. 簽約訂金：總價 50% 即 NT$52,500，簽約後支付。\n2. 驗收尾款：NT$52,500，驗收通過後支付。\n\n> 這是示範資料產生的合約文件；正式環境的合約全文由後台「設定 → 合約模板」自動合成。',
  'signed',
  'demo-contract-token',
  now() - interval '9 days',
  now() - interval '9 days',
  '示範客戶',
  '203.0.113.10',
  'Mozilla/5.0 (Demo Seed)'
) on conflict do nothing;

-- ③-3 案件：進行中（由報價自動開案的樣子；portal_token 供客戶入口展示）
insert into client_cases (
  id, title, client_name, contact_email, source, status,
  budget, currency, notes,
  quote_id, contract_id, deposit_paid_at, auto_opened, portal_token
) values (
  'd0000000-0000-4000-8000-000000000301',
  '示範官網建置案',
  '示範客戶',
  'demo@example.com',
  'ai_chat',
  '進行中',
  105000,
  'TWD',
  '（示範資料）完整案件鏈：報價接受 → 合約簽署 → 訂金入帳 → 自動開案。',
  'd0000000-0000-4000-8000-000000000401',
  'd0000000-0000-4000-8000-000000000501',
  now() - interval '8 days',
  true,
  'demo-portal-token'
) on conflict do nothing;

-- ③-4 訂金請款單：已付款（payment_no 由 default 序號自動產生；方法用 bank_transfer 免依賴金流設定）
insert into payments (
  id, case_id, quote_id, contract_id, kind, title,
  amount, status, method, public_token, paid_at
) values (
  'd0000000-0000-4000-8000-000000000601',
  'd0000000-0000-4000-8000-000000000301',
  'd0000000-0000-4000-8000-000000000401',
  'd0000000-0000-4000-8000-000000000501',
  'deposit',
  '簽約訂金（50%）',
  52500,
  'paid',
  'bank_transfer',
  'demo-pay-deposit',
  now() - interval '8 days'
) on conflict do nothing;

-- ③-5 里程碑 ×2：一個已完成、一個進行中
insert into milestones (id, case_id, title, description, due_date, status, sort_order, done_at) values
  (
    'd0000000-0000-4000-8000-000000000701',
    'd0000000-0000-4000-8000-000000000301',
    '需求確認與視覺設計',
    '訪談需求、確認網站架構，完成首頁與內頁視覺設計稿。',
    current_date - 5,
    'done',
    1,
    now() - interval '5 days'
  ),
  (
    'd0000000-0000-4000-8000-000000000702',
    'd0000000-0000-4000-8000-000000000301',
    '開發與上線',
    '前後台開發、內容上稿、測試與正式上線。',
    current_date + 14,
    'in_progress',
    2,
    null
  )
on conflict do nothing;

-- ③-6 交付物 ×1：已交付（文字型 content_md，免依賴 storage bucket；非最終交付避免觸發驗收提醒 cron）
insert into deliverables (id, case_id, milestone_id, title, content_md, version, status, is_final) values
  (
    'd0000000-0000-4000-8000-000000000801',
    'd0000000-0000-4000-8000-000000000301',
    'd0000000-0000-4000-8000-000000000701',
    '首頁視覺設計稿 v1',
    E'## 首頁視覺設計說明（示範交付物）\n\n- 色系：主色深藍＋輔色暖金\n- 版型：首屏標語＋服務三卡＋作品輪播＋聯絡表單\n- 附件：正式環境的檔案型交付物會存在私有 bucket，客戶透過簽名 URL 下載。',
    1,
    'delivered',
    false
  )
on conflict do nothing;

-- ③-7 專案動態 ×2：系統事件＋手動更新（portal 時間軸展示）
insert into case_updates (id, case_id, author, body, created_at) values
  (
    'd0000000-0000-4000-8000-000000000901',
    'd0000000-0000-4000-8000-000000000301',
    'system',
    '（示範）合約已完成簽署、訂金已入帳，專案正式啟動。',
    now() - interval '8 days'
  ),
  (
    'd0000000-0000-4000-8000-000000000902',
    'd0000000-0000-4000-8000-000000000301',
    'owner',
    '（示範）首頁視覺設計稿已交付，歡迎在客戶入口留言回饋。',
    now() - interval '2 days'
  )
on conflict do nothing;
