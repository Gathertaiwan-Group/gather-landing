# 給樂數位 Gather 官網

> 🌐 線上：https://gather-landing-kappa.vercel.app

AI 賦能的客製化數位系統 — 單頁式精品形象官網。
技術棧：**Next.js 14 (App Router) + TypeScript + Supabase**，部署於 **Vercel**。

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
| `supabase/schema.sql` | 資料表 schema（projects / contact_submissions / blog_posts）|

## Supabase

Gather 專案 ref：`xdyldehjoobvdgddcalh`（`https://xdyldehjoobvdgddcalh.supabase.co`）。

**目前狀態**：專案為 INACTIVE（免費方案 active 上限已滿）。
網站以內建作品集 fallback 正常運作，無需 DB 也能上線。

**啟用 DB 後（空出名額或升級 Pro）：**
1. Supabase Dashboard 喚醒 Gather 專案。
2. SQL Editor 執行 `supabase/schema.sql`。
3. Project Settings → API 取得 `anon` 與 `service_role` key。
4. 在 Vercel 專案環境變數填入 `NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`，重新部署。
   → 作品集自動改讀 DB，聯絡表單開始寫入 `contact_submissions`。

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
