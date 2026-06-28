# 給樂數位 Gather 官網 — Claude Code 交接文件

> 目標：**100% 還原**這份設計，並部署到 **Vercel + GitHub + Supabase + Railway**。
> 本文件可獨立閱讀——沒有參與設計過程的工程師，只看這份文件 + `reference-build/index.html` 就能完整重建。

---

## 0. 給接手的 Claude Code 的話（請先讀）

- `reference-build/index.html` 是**唯一的視覺事實來源（source of truth）**。它是一份**純 HTML + inline 樣式 + 原生 JS** 的完整重現檔，直接用瀏覽器開啟即與正式設計一模一樣。**請逐像素照搬**：所有顏色、字級、間距、圓角、陰影、動效數值都已寫死在裡面，照抄即可達成 100% 還原。
- `design-source/` 內是原始設計元件（`.dc.html`），僅供參考，**不需**移植其執行框架。
- 你的任務：把 `index.html` 的結構與樣式，搬進一個 **Next.js（App Router）+ TypeScript + Tailwind 或 inline style** 專案，並接上後端（Supabase / Railway），最後部署到 Vercel。
- **保真優先**：先做到靜態頁面與正式設計 100% 相同（截圖比對無差異），再接資料庫與後端。不要在還原階段「順手優化」任何視覺。

---

## 1. 專案概述

**給樂數位（Gather）** 是一家資訊公司的官方網站，主打 **AI 賦能的客製化數位系統**。單頁式（one-page）精品形象官網，風格參考 Apple 官網：淺色乾淨基調、超大粗體標題、藍橘漸層點綴、Bento 卡片網格、藥丸按鈕、滾動進場動效。

**公司資料**
- 中文名：給樂行銷有限公司（品牌：給樂數位）
- 英文名：Gather（Gather Taiwan）
- 統一編號：82962763
- 主要聯絡：LINE 官方帳號 `https://line.me/R/ti/p/@864nqqxj`
- 既有官網：https://gathertaiwan.com/

**頁面區塊（由上到下）**
1. 固定導覽列 Nav
2. Hero 首屏
3. 理念 About（滾動逐字點亮）
4. 服務 Services（7 項 Bento 網格）
5. 作品 Work（6 案例網格）
6. 聯絡 Contact（CTA → LINE）
7. 頁尾 Footer

---

## 2. 保真度：High-fidelity（hifi，要求 100% 還原）

這是**像素級定稿**。所有顏色、字體、間距、互動都是最終值，請用目標環境的元件**逐像素重建**。`reference-build/index.html` 的每個 inline style 即為規格，**直接複製數值**，不要重新詮釋。

---

## 3. 架構與部署

建議技術棧（若你已有其他偏好且能 100% 還原，可調整）：

| 層 | 技術 | 平台 | 用途 |
|---|---|---|---|
| 程式碼倉庫 | Git | **GitHub** | 版本控管、CI 觸發來源 |
| 前端 | **Next.js 14+（App Router）+ TypeScript** | **Vercel** | 靜態/SSR 官網、表單 API route |
| 資料庫 / 認證 / 儲存 | **Supabase（Postgres + Auth + Storage）** | Supabase | 作品集 CMS、聯絡表單、（選配）部落格、後台登入、圖片儲存 |
| 後端服務 / 排程 | **Railway** | Railway | 常駐 Node 服務：LINE/Email 通知 worker、排程任務、（選配）金流／電子發票 webhook |

### 資料流
```
使用者瀏覽器
   │  靜態頁面
   ▼
Vercel (Next.js)  ──讀作品集/部落格──►  Supabase (Postgres)
   │  聯絡表單 POST                        ▲
   ▼                                       │ 後台管理（Auth）寫入
Next API route ──寫 contact_submissions──┘
   │  觸發通知
   ▼
Railway worker ──► 寄 Email / 推 LINE Notify
```

### 部署步驟（給 Claude Code 的執行順序）
1. **GitHub**：建立 repo，推上 Next.js 專案。
2. **Supabase**：建立專案 → 執行 `§7 資料表 schema` 的 SQL → 取得 `Project URL`、`anon key`、`service_role key`。
3. **Vercel**：Import GitHub repo → 設定環境變數（見 §8）→ Deploy。每次 push 自動部署。
4. **Railway**：部署 `worker/` 服務（若需通知/排程）→ 設定環境變數 → 連到 Supabase。
5. 設定自訂網域（gathertaiwan.com 或新網域）指向 Vercel。

> 若初期只要「100% 還原 + 上線」，**最小可行**只需 GitHub + Vercel（純靜態）。Supabase/Railway 可在第二階段接入作品集 CMS 與聯絡表單。

---

## 4. 版型與響應式

- **容器**：主要內容 `max-width:1160px`（Hero 文字區 1000px、Hero 視覺 1120px、理念 1020px、聯絡 820px），水平置中。
- **區塊左右留白（padding-x）**：`6vw`。
- **區塊上下 padding**：Hero `170px 6vw 90px`；理念/聯絡 `170px 6vw`；服務/作品 `140px 6vw`；頁尾 `50px 6vw`。
- **背景交替**：白 `#ffffff`（Hero、服務、聯絡）與淺灰 `#f5f5f7`（理念、作品、頁尾）。
- **錨點捲動**：各 section 設 `scroll-margin-top:60px`（因固定 nav 高 54px）。`html{scroll-behavior:smooth}`。
- **響應式**：reference build 以桌機為主，字級用 `clamp()` 已具流動性。手機需處理：
  - Nav：建議窄螢幕收成漢堡選單（reference 未實作，請依 Next 專案慣例補）。
  - 服務 Bento `grid-template-columns:repeat(6,1fr)`：≤768px 改為單欄、卡片 `grid-column` 全寬。
  - 作品 `repeat(3,1fr)`：≤900px 改 2 欄、≤600px 改 1 欄。

---

## 5. 設計 Tokens（直接採用）

### 顏色
| 用途 | Hex |
|---|---|
| 主文字 | `#1d1d1f` |
| 次要文字 / 說明 | `#6e6e73` |
| 更淺說明 | `#86868b` |
| 佔位標籤文字 | `#9aa3b0` |
| 理念未點亮字 | `#c7c7cc` |
| 背景白 | `#ffffff` |
| 背景淺灰 | `#f5f5f7` |
| 品牌藍（主） | `#1668c2` |
| 品牌藍 hover（深） | `#0f56a6` |
| 品牌橘 | `#ef7d22` |
| 深色卡背景 | `#1d1d1f` |
| 深色卡藍標籤 | `#5aa0ec` |
| 深色卡橘標籤 | `#f0a564` |
| 藍橘漸層（標題/logo） | `linear-gradient(110deg,#1668c2 10%,#ef7d22 90%)` |
| logo 方塊漸層 | `linear-gradient(135deg,#1668c2,#ef7d22)` |

### 字體
- 字族：`-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "PingFang TC", "Noto Sans TC", sans-serif`（Apple 系統字優先，非 Apple 裝置 fallback 到 Noto Sans TC）。
- 載入：Google Fonts `Noto Sans TC`（300/400/500/600/700/900）、`Space Mono`（佔位標籤用等寬字）。
- 字重：標題 700、次標 600、按鈕/標籤 500–600、內文 300–400。
- 字距：大標 `letter-spacing:-.028em`（負字距）；小標籤 `+.04em`～`+.12em`（正字距、英文大寫）。

### 字級（關鍵）
| 元素 | font-size | weight | line-height |
|---|---|---|---|
| Hero H1 | `clamp(46px,7.4vw,104px)` | 700 | 1.05 |
| Hero 副標 | `clamp(18px,2.1vw,23px)` | 400 | 1.6 |
| 理念大字 | `clamp(28px,4vw,54px)` | 700 | 1.4 |
| 區塊主標題 H2 | `clamp(36px,5vw,72px)` | 700 | 1.06 |
| 聯絡 H2 | `clamp(40px,6vw,90px)` | 700 | 1.04 |
| 眉標（eyebrow） | 15–19px | 600 | — |
| Bento 大卡標題 | `clamp(28px,3vw,38px)` | 700 | — |
| Bento 小卡標題 | 24–26px | 700 | — |
| 內文/卡片說明 | 15–17px | 300–400 | 1.65–1.7 |

### 圓角
- 大卡 `30px`、中卡 `26px`、作品卡 `24px`、Hero 視覺 `30px`、按鈕 `980px`（藥丸）、logo 方塊 `2px`。

### 陰影
- 卡片預設：`0 8px 30px rgba(20,40,80,.07)`
- 作品卡 hover：`0 24px 50px rgba(20,40,80,.16)`
- Hero 視覺：`0 30px 70px rgba(20,40,80,.14)`

### 間距節奏
- 卡片 padding：大卡 `42px`、中卡 `34px`、寬卡 `38px`、作品卡內文 `24px 26px 28px`。
- 網格間距：服務 `gap:20px`、作品 `gap:26px`。
- 導覽列高 `54px`，毛玻璃 `backdrop-filter:saturate(180%) blur(20px)`，底線 `1px solid rgba(0,0,0,.07)`。

---

## 6. 各區塊規格

> 完整 markup 與每一條 inline style 見 `reference-build/index.html`，以下為重點與文案。

### 6.1 Nav（固定）
- `position:fixed; top:0; height:54px; padding:0 6vw`，半透明白底 + 毛玻璃。
- 左：logo＝藍橘漸層小方塊（9×9，旋轉 45°）＋「Gather」(600/19px)＋「給樂數位」(12px, `letter-spacing:.32em`, `#86868b`)。
- 右：文字連結「理念 / 服務 / 作品」(14px, opacity .82→1 on hover)＋藥丸 CTA「聯絡我們」(藍底白字, hover 變 `#0f56a6` 且上移 1px)。

### 6.2 Hero
- 眉標：`Gather 給樂數位　·　AI 賦能`（藍 `#1668c2`, 600/19px）。
- H1：`為每個品牌，<br>打造專屬的[數位資產]。`——「數位資產」四字套藍橘漸層文字。
- 副標：`客製化網站、AI 賦能的 CRM 系統、金流物流與電子發票串接——讓智慧技術與精緻設計精準結合，一站到位。`
- 按鈕：藥丸「預約諮詢」(→LINE) ＋ 文字鈕「了解服務 ›」(→#services)。
- Hero 視覺：`aspect-ratio:16/8` 大圓角佔位框（斜紋 + 等寬字標籤「首頁主視覺 / 產品截圖」）。**此處放公司首頁主圖／產品截圖**。

### 6.3 About / 理念
- 眉標「Our Philosophy」。
- 大字（逐字點亮動效）：`我們不只交付網站，而是交付一套由 AI 賦能、值得被信賴、能隨品牌持續成長的數位系統。當智慧技術與精緻設計結合，品牌的價值不只是相加，而是相乘。`

### 6.4 Services（Bento 7 項）
- 眉標「Our Services」＋ H2「完整的數位化能力」＋ 副標「七項以 AI 賦能的核心服務，覆蓋品牌數位化的完整旅程。」
- 網格 `repeat(6,1fr)`，卡片 span 配置：
  1. **客製化網站建置**（深色大卡, span 3, 藍光暈）— 從品牌策略、視覺到前後端工程，量身打造專屬於你的企業形象與電商網站。
  2. **AI CRM 系統客製化開發**（深色大卡, span 3, 橘光暈, 編號 05）— 依營運流程打造會員與客戶關係管理系統，導入 AI 分析與自動化，讓數據驅動每一次決策。
  3. **金流／物流串接**（span 2, 編號 03）— 串接主流金流與物流，從下單到出貨一氣呵成。
  4. **電子發票串接**（span 2, 編號 04）— 自動化開立、作廢與管理，合規又省力。
  5. **部落格系統**（span 2, 編號 02）— 穩固的內容管理架構，持續累積品牌聲量。
  6. **網站代管與維護**（span 3, 編號 06）— 伺服器管理、資安防護、備份與效能優化，確保網站穩定運行無虞。
  7. **SEO／數位行銷顧問**（span 3, 編號 07）— 以 AI 驅動流量分析、轉換率提升與行銷自動化，成為品牌長期成長的策略夥伴。
- 深色卡有 `radial-gradient` 光暈，套 `@keyframes gtGlow`（11s / 13s）緩慢漂移。

### 6.5 Work / 作品（6 案例）
- 眉標「Featured Projects」＋ H2「代表案例」。
- 卡片：4:3 佔位圖（**放各案例網站截圖**）＋ 類別標籤（橘）＋ 名稱 ＋ `↗`；hover 上移 8px、陰影加深。
- 資料（見 `index.html` 的 `PROJECTS` 陣列，建議改存 Supabase `projects` 表）：

| 類別 | 名稱 | 連結 |
|---|---|---|
| 企業形象官網 | 聯成外語線上語言學校 | https://www.abcgo.com.tw/ |
| 企業電商官網 | 台灣宮廷酒廠 | https://go.palacetwshop.com/ |
| 企業形象官網 | 工富家飾 | https://kcasa.pro/ |
| 企業形象官網 | 松澄會計師事務所 | https://songchencpa.odoo.com/ |
| 部落客 | Three of Us | https://loveccdd.com/ |
| 線上課程網站 | 台灣環境生態護育產業工會 | https://beunion.tw/ |

### 6.6 Contact
- 眉標「Let's Work Together」＋ H2「已經有想法了嗎？」＋ 副標 ＋ 藥丸 CTA「透過 LINE 聯絡我們」。
- **若要做聯絡表單**：改為姓名/Email/需求 欄位 → POST 到 Next API route → 寫入 Supabase `contact_submissions` → Railway worker 發通知。LINE 連結保留為次要 CTA。

### 6.7 Footer
- logo 方塊 + 「Gather」｜「給樂行銷有限公司　·　統編 82962763　·　Copyright © 2026 All rights reserved.」｜「LINE 諮詢 ›」。

---

## 7. 互動與動效（100% 還原重點）

全部由 `index.html` 底部單一 `requestAnimationFrame` 迴圈驅動（每幀重算，避免任何狀態卡住）。移植到 React 時放進**一個 client component 的 `useEffect`**，掛載時啟動 rAF、卸載時 `cancelAnimationFrame`。

1. **進場揭開（data-reveal）**：元素捲入視窗（`rect.top < innerHeight*0.9`）後，以 `easeOutCubic` 在 **850ms** 內從 `opacity:0 / translateY(40px) / scale(.97) / blur(6px)` 過渡到完全顯示。
2. **錯落 stagger**：同一 `data-stagger-group` 內的子項，每項延遲 `index × 90ms`。（Hero 文字、服務 Bento、作品網格各為一組。）
3. **主視覺微縮放（data-scroll-scale）**：Hero 視覺隨其在視窗中的位置在 `scale(0.972)`～`scale(1.012)` 間呼吸。
4. **理念逐字點亮（data-words）**：大字拆成逐字 `span`，隨捲動進度（區間 `innerHeight*0.82`→`*0.34`）由 `#c7c7cc` 依序轉為 `#1d1d1f`。
5. **光暈漂移**：深色 Bento 卡內 `radial-gradient` 圓，套 `@keyframes gtGlow` 11s/13s 緩慢位移縮放。
6. **hover**：nav 連結 opacity .82→1；藥丸鈕底色 `#1668c2→#0f56a6` 且上移；文字鈕 opacity；作品卡上移 8px + 陰影加深。

> ⚠️ 注意：移植時**不要**用 IntersectionObserver 取代上述揭開邏輯——本設計刻意改用每幀 rect 偵測，以確保在各種容器/縮放環境下都能正確觸發且不會卡在隱藏狀態。React 版照搬 rAF 迴圈即可。

---

## 8. Supabase 資料表 schema（SQL）

```sql
-- 作品集
create table projects (
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
create table contact_submissions (
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
create table blog_posts (
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

create policy "public read published projects"
  on projects for select using (published = true);
create policy "public read published posts"
  on blog_posts for select using (published = true);
create policy "anyone can submit contact"
  on contact_submissions for insert with check (true);
```

> 後台（新增/編輯作品、看聯絡訊息）建議用 Supabase Auth 保護的 `/admin` 路由，或直接用 Supabase Studio 管理。

---

## 9. 環境變數

**Vercel（Next.js）**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # 僅 server 端用
NEXT_PUBLIC_LINE_URL=https://line.me/R/ti/p/@864nqqxj
```
**Railway（worker，選配）**
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...                     # 或其他寄信服務
LINE_NOTIFY_TOKEN=...                  # 若用 LINE 通知
NOTIFY_EMAIL_TO=...                    # 收件信箱
```

---

## 10. 資產（Assets）

目前設計使用**佔位元素**，需替換成真實素材：
- **Logo**：現為文字標 `Gather` + 藍橘漸層小方塊（CSS 畫的）。若有正式 logo（藍＋橘）PNG/SVG，置於 `public/` 並替換 nav 與 footer 的標記。
- **Hero 主視覺**：`首頁主視覺 / 產品截圖` 佔位框 → 放公司形象主圖或產品截圖（建議 16:8、≥1600px 寬）。
- **作品集截圖**：6 個案例各一張 4:3 截圖，存 Supabase Storage 並填入 `projects.image_url`。
- **字體**：Google Fonts（Noto Sans TC、Space Mono）已用 CDN，無需自帶檔案。
- **OG/分享圖、favicon**：另製作（沿用藍橘 logo）。

---

## 11. 檔案清單（本交接包）

```
design_handoff_gather_website/
├── README.md                              ← 本文件
├── reference-build/
│   └── index.html                         ← ★ 100% 還原的純 HTML 重現檔（視覺事實來源，直接開啟即見正式設計）
├── preview/
│   └── gather-apple-preview.html          ← 離線自包含預覽（含執行環境，雙擊即可看，含動效）
└── design-source/
    ├── 給樂數位官網-Apple風.dc.html        ← 原始設計元件（Apple 風，主版本）
    ├── 給樂數位官網-深色版.dc.html          ← 早期深色奢華版本（替代風格參考，可忽略）
    └── support.js                          ← 設計元件執行環境（僅供 .dc.html 運行；正式專案不需要）
```

**還原優先順序**：以 `reference-build/index.html` 為準 → `preview/gather-apple-preview.html` 對照動效 → `design-source/*.dc.html` 僅作補充參考。

---

## 12. 驗收標準（Definition of Done）

- [ ] 桌機 1440px 寬下，與 `reference-build/index.html` **截圖比對無可見差異**（顏色/字級/間距/圓角/陰影一致）。
- [ ] 進場揭開、stagger、主視覺微縮放、理念逐字點亮、光暈漂移、所有 hover 狀態都正確重現。
- [ ] 手機/平板響應式正常（nav 收合、Bento 與作品改單/雙欄）。
- [ ] 所有 CTA 連到 LINE `@864nqqxj`；作品卡連到正確外部網址。
- [ ] 已部署到 Vercel，GitHub push 自動觸發部署。
- [ ]（第二階段）作品集改由 Supabase 讀取；聯絡表單寫入 Supabase 並由 Railway worker 發通知。
