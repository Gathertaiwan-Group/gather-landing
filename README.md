# 給樂數位 Gather 官網

> 🌐 線上：https://gather-landing-kappa.vercel.app

AI 賦能的客製化數位系統 — 形象官網＋**AI 接案自動化系統**
（AI 客服 → 報價 → 合約 e-sign → 收款 → 自動開案 → 客戶入口 → 結案，含密碼後台 `/admin`）。
技術棧：**Next.js 14 (App Router) + TypeScript + Supabase**，部署於 **Vercel**（每日 cron 自動跟進），寄信 **Resend**、AI **Gemini**、金流 **PChomePay**。

> 設計事實來源與完整規格見 [`design_handoff_gather_website/`](./design_handoff_gather_website)。
> 本專案由 `reference-build/index.html` 逐項移植，保真度 100%。

## 本地開發

```bash
npm install
cp .env.example .env.local   # 填入 Supabase key（可留空，會用內建作品集）
npm run dev                  # http://localhost:3000
```

## 架構

| 路徑 | 說明 |
|---|---|
| `app/page.tsx` | Server component，從 Supabase 讀作品集（失敗則 fallback）|
| `components/GatherLanding.tsx` | Client component，整頁 UI + rAF 動效 |
| `app/api/contact/route.ts` | 聯絡表單 API，寫入 `contact_submissions` |
| `lib/supabase.ts` | Supabase server / admin client |
| `lib/projects.ts` | 作品集讀取 + 內建 fallback 清單 |
| `app/blog/` | 部落格列表 `/blog` 與文章頁 `/blog/[slug]`（Markdown 渲染）|
| `app/api/blog/route.ts` | 部落格寫入 API（hermes agent 用，Bearer token）|
| `lib/blog.ts` | 文章讀取（已發佈 + 排程過濾）|
| `supabase/schema.sql` | 全部資料表 schema＋RLS＋限流函式（官網／後台／報價／合約／請款／portal）；可在全新 Supabase SQL Editor 一次執行 |
| `supabase/seed-demo.sql` | 展示環境示範資料（demo 案件鏈；正式環境勿跑）|

## 部落格

- 前台：`/blog`（分類篩選：數位行銷 / AI 賦能）、`/blog/[slug]`（Markdown 內文）。
- 首頁有「最新文章」區（有文章才顯示）。
- **自動上架**：hermes agent 透過 `POST /api/blog`（`Authorization: Bearer <BLOG_API_TOKEN>`）發文，支援排程（未來 `published_at`）。完整契約見 [`docs/BLOG_API.md`](docs/BLOG_API.md)。
- 環境變數：`BLOG_API_TOKEN`（agent 金鑰）、`NEXT_PUBLIC_SITE_URL`。

## Supabase

Gather 正式專案 ref：`iyslargzomlvxvilsopo`（Tokyo，ACTIVE，已接妥）。

**在新專案重建 DB：**
1. SQL Editor 執行 `supabase/schema.sql`（一次執行完成建置；只跑一次）。
2. Storage 手動建私有 bucket `deliverables`（schema 管不到 Storage）。
3. Project Settings → API 取得 `anon` 與 `service_role` key，填入 Vercel 環境變數後重新部署。
   完整步驟見下方「白牌部署」。

## 白牌部署（White-label）

這套系統可整套複製給買家：**全新 Vercel＋Supabase 起一套獨立實例**，
公司資訊／訂金比例／合約模板／價目表全部在後台 `/admin/settings` 換，不用改程式碼。

- 完整 SOP（帳號清單 → 建庫 → 寄信網域 → env 表 → 部署後驗收 → 上線切換 → 交付買家）：
  **[`docs/DEPLOY-WHITELABEL.md`](docs/DEPLOY-WHITELABEL.md)**
- 展示資料：`supabase/seed-demo.sql`（demo 專用，正式環境勿跑）
- 環境變數全貌與繁中註解：[`.env.example`](.env.example)

## 環境變數

| 變數 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開讀取（作品集）|
| `SUPABASE_SERVICE_ROLE_KEY` | server 端寫入（聯絡表單），勿外洩 |
| `NEXT_PUBLIC_LINE_URL` | LINE 官方帳號連結 |

## 部署 / CI

- **Vercel**：已連結此 GitHub repo，push 到 `main` 自動部署（CD）。
- **GitHub Actions**（`.github/workflows/ci.yml`）：push / PR 觸發 type check + build（CI）。
