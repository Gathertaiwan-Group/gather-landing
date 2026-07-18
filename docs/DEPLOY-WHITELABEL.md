# 白牌部署 SOP（White-label Deploy）

> 目標：照本文件，在**全新的 Vercel＋Supabase 帳號**上，從零起一套完整可收錢的
> 「AI 接案自動化系統」實例（AI 客服 → 報價 → 合約 e-sign → 收款 → 自動開案 → 客戶入口 → 結案）。
> 一個買家＝一份 repo 副本＋一個 Vercel 專案＋一個 Supabase 專案，資料完全隔離。
>
> 全程不用改任何程式碼：公司資訊、訂金比例、合約模板、價目表都在後台「設定」頁換（見步驟④）。
> 預估工時：第一次照做約 2～3 小時（不含 DNS 生效與 PChomePay 開戶等待）。

---

## 前置需求：帳號清單

| 服務 | 用途 | 要準備什麼 |
|---|---|---|
| GitHub | 放這份 repo 的副本（private） | 一個 GitHub 帳號；把本 repo 複製一份 private repo（新實例專用，勿多實例共用同 repo） |
| Vercel | 部署網站＋每日 cron | 帳號（免費 Hobby 可起步）；連結上面的 GitHub repo |
| Supabase | 資料庫＋私有檔案儲存 | 帳號；免費方案可起步（注意免費 active 專案數上限） |
| Resend | 寄信（諮詢通知／報價／合約／請款／跟進信） | 帳號＋一個**可改 DNS 的網域**（寄件網域驗證用，必備） |
| Google AI Studio | Gemini API（AI 客服／報價草稿／開案初稿） | Google 帳號 → [aistudio.google.com](https://aistudio.google.com) 建 API key（免費額度可起步） |
| PChomePay 支付連 | 線上收款（信用卡／ATM 虛擬帳號） | **買家自備**商家帳號（要公司行號申請、需審核數個工作天）；未開通前其餘功能全部正常，只有線上付款按鈕回 503，可先用「後台標記已收款（匯款）」過渡 |
| （選）Pexels | 部落格自動配圖 | 免費 API key |
| （選）Google Analytics 4 | 流量追蹤 | GA4 資源＋Measurement ID（G-XXXX） |

---

## ① 建 Supabase 專案＋跑 schema＋建 bucket

- [ ] Supabase Dashboard → New project（region 建議 Northeast Asia (Tokyo)，密碼收好）
- [ ] 專案建好後 → **SQL Editor** → 貼上 `supabase/schema.sql` 全文 → Run
  - 一次執行即可完成全部建置（資料表、RLS、限流函式 `ai_rate_check`）
  - **只跑一次**：重跑會重複插入內建作品集示範列
- [ ] （白牌情境）刪掉內建的給樂作品集，之後由買家自行維護：
  ```sql
  delete from projects;
  ```
- [ ] **手動建私有 bucket**（schema.sql 管不到 Storage，一定要手動做）：
  - Storage → New bucket → 名稱 **`deliverables`**（一字不差，小寫）
  - Public bucket：**關閉**（必須是 private；交付物下載一律走簽名 URL）
  - File size limit：**50 MB**
  - 註：app 端上傳單檔另有 4 MB 上限（serverless 請求體限制），bucket 的 50MB 是上層保險
- [ ] Project Settings → API，抄下三個值備用：
  - Project URL（`https://<ref>.supabase.co`）
  - `anon` public key
  - `service_role` secret key（**絕不可外流、絕不可加 NEXT_PUBLIC_ 前綴**）
- [ ] （展示環境選用）SQL Editor 跑 `supabase/seed-demo.sql` 灌示範資料
  —— 正式買家環境**勿跑**；詳見該檔檔頭說明

## ② Resend 寄件網域驗證

- [ ] [resend.com](https://resend.com) → Domains → Add Domain → 輸入買家網域（例 `example.com.tw`，也可用子網域 `mail.example.com.tw`）
- [ ] 到網域的 DNS 管理後台，照 Resend 顯示的值加**三筆記錄**：
  - MX（`send` 子網域，收退信用）
  - TXT（SPF，`send` 子網域）
  - TXT（DKIM，`resend._domainkey`）
- [ ] 等 Resend 顯示 Verified（DNS 生效通常數分鐘～數小時）
- [ ] API Keys → Create API Key（Full access），抄下備用
- [ ] 決定寄件人格式，例：`買家品牌 <noreply@example.com.tw>` → 這就是 `RESEND_FROM`

## ③ Vercel 匯入 repo＋設環境變數

- [ ] Vercel → Add New → Project → Import 買家的 GitHub repo（Framework 自動偵測 Next.js，不用改建置設定）
- [ ] **先設好環境變數再按 Deploy**（Environment Variables，全部 environments 勾 Production＋Preview）：

> 下表與 `.env.example` 一一對應（該檔有完整繁中註解，可對照看）。
> 「必填」= 缺了對應功能會失效；選填缺了走預設值。

| 變數 | 必填? | 去哪拿 | 範例 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 步驟① Project URL | `https://abcd1234.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 步驟① anon key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 步驟① service_role key（勿外流） | `eyJhbGciOi...` |
| `RESEND_API_KEY` | ✅ | 步驟② Resend API Key | `re_xxxxxxxx` |
| `RESEND_FROM` | ✅ | 自訂（網域須已驗證） | `買家品牌 <noreply@example.com.tw>` |
| `CONTACT_NOTIFY_TO` | ✅ | 買家老闆收諮詢通知的信箱 | `boss@example.com.tw` |
| `CRON_SECRET` | ✅ | 自產強隨機字串（`openssl rand -hex 32`）；未設則 cron 一律 401 | `f3a9...64碼` |
| `QUOTE_FOLLOWUP_DAYS` | 選 | 報價寄出 N 天未接受寄跟進信（預設 3） | `3` |
| `PCHOMEPAY_APP_ID` | **買家自備** | PChomePay 商家後台；未設時僅線上付款回 503 | `AB123456789` |
| `PCHOMEPAY_SECRET` | **買家自備** | PChomePay 商家後台 | `xxxxxxxx` |
| `PCHOMEPAY_SANDBOX` | 選 | 測試期 `true`；正式上線改 `false`（見步驟⑤） | `true` |
| `PCHOMEPAY_PAY_TYPES` | 選 | 開放付款方式（預設 `CARD,ATM`） | `CARD,ATM` |
| `LIFECYCLE_FOLLOWUP_DAYS` | 選 | 合約未簽／請款未付 N 天提醒一次（預設 3） | `3` |
| `REVISIT_DAYS` | 選 | 結案 N 天後寄回訪信（預設 30） | `30` |
| `BLOG_API_TOKEN` | 選 | 自產強隨機字串；給外部 agent 發文 API 用，不用自動發文可不設 | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | ✅ | 買家正式網域（信件內所有連結的基底） | `https://www.example.com.tw` |
| `PEXELS_API_KEY` | 選 | pexels.com/api（部落格自動配圖） | `563492ad...` |
| `NEXT_PUBLIC_GA_ID` | 選 | GA4 資料串 Measurement ID | `G-XXXXXXXXXX` |
| `GEMINI_API_KEY` | ✅ | Google AI Studio → Get API key | `AIzaSy...` |
| `ADMIN_PASSWORD` | ✅ | 自訂後台登入密碼（強隨機，交付時換買家的） | `openssl rand -base64 18` |
| `ADMIN_SESSION_SECRET` | ✅ | 自產強隨機字串（後台 session 簽章用） | `openssl rand -hex 32` |

- [ ] 按 Deploy，等第一次部署完成
- [ ] 確認 Vercel 專案 Settings → Cron Jobs 出現兩條（來自 `vercel.json`）：
  `/api/cron/quote-followup`（每日 01:00 UTC）、`/api/cron/lifecycle`（每日 01:30 UTC）
  —— Vercel 觸發 cron 時會自動帶 `Authorization: Bearer <CRON_SECRET>`

## ④ 部署後檢查清單

先跑 curl smoke（`<site>` 換成 Vercel 給的網址）：

- [ ] 首頁正常：`curl -s -o /dev/null -w '%{http_code}' https://<site>/` → **200**
- [ ] 後台有鎖：`curl -s -o /dev/null -w '%{http_code}' https://<site>/admin` → **307**（導向 /admin/login）
- [ ] cron 有鎖：`curl -s -o /dev/null -w '%{http_code}' https://<site>/api/cron/quote-followup` → **401**
- [ ] cron 有鎖：`curl -s -o /dev/null -w '%{http_code}' https://<site>/api/cron/lifecycle` → **401**

再過後台功能：

- [ ] `/admin/login` 用 `ADMIN_PASSWORD` 登入成功
- [ ] `/admin/settings` **把四項設定全部換成買家的**（這就是白牌的核心——不動程式碼）：
  - [ ] 公司資訊（`company_profile`）：公司名／統編／Email／電話／匯款帳戶 → 合約抬頭與信件署名都吃這裡
  - [ ] 訂金比例（`deposit_ratio`）：預設 50%
  - [ ] 合約模板（`contract_template`）：Markdown，含 `{{client_name}}` 等替換變數
  - [ ] 價目表（`rate_card`）：AI 報價的金額一律鎖在這張表內，AI 不會自己編價格
- [ ] 官網首頁 AI 客服對話正常回覆（會回覆＝Gemini key＋`ai_rate_check` 都正常；若一開口就說「今天的 AI 試用次數用得差不多了」＝schema.sql 沒跑完整，回步驟①）
- [ ] **發一筆測試報價走完整鏈**（用自己的信箱當客戶）：
  1. 後台 `/admin/quotes` 建報價 → 寄送 → 收到報價信
  2. 開信中 `/quote/<token>` → 按同意 → 自動產生合約
  3. `/contract/<token>` 線上簽署 → 自動產生訂金請款單＋請款信
  4. `/pay/<token>`：PChomePay 未設會顯示無法線上付款 → 改在後台把該筆請款「標記已收款」
  5. 確認自動開案（`/admin/cases` 出現新案件）＋客戶入口 `/portal/<token>` 可看進度
  6. 後台上傳交付物（驗 bucket）→ 完工 → 產生尾款單 → 標記已收款 → 自動結案
- [ ] （展示環境）跑過 `seed-demo.sql` 的話，用檔頭列的 demo token 網址巡一遍展示動線

## ⑤ 上線切換（正式收錢前）

- [ ] Vercel → Settings → Domains 綁買家正式網域（DNS 加 A/CNAME 記錄）
- [ ] `NEXT_PUBLIC_SITE_URL` 改成正式網域 → **Redeploy**（信件連結才會用正式網域）
- [ ] PChomePay 商家帳號審核通過後：
  - [ ] 填入正式 `PCHOMEPAY_APP_ID`／`PCHOMEPAY_SECRET`
  - [ ] `PCHOMEPAY_SANDBOX` 改 `false` → **Redeploy**
  - [ ] 注意：付款結果通知（notify）是 PChomePay 主動回呼，**網站必須在公開網域上**（本機測不到）
- [ ] 真實小額付款測試：發一筆小額（例 NT$10）請款單 → 真刷卡付款 → 確認狀態自動變已付款、通知信有寄 → 到 PChomePay 後台把這筆**退款**
- [ ] 確認 GA4（有設的話）收得到事件

## ⑥ 交付買家清單

- [ ] 帳號移交：GitHub repo、Vercel 專案、Supabase 專案、Resend、Google AI Studio、PChomePay ——擁有權全部轉移或加買家為 Owner（至少 Supabase＋PChomePay 必須是買家自己的）
- [ ] **換掉 `ADMIN_PASSWORD`＋`ADMIN_SESSION_SECRET`** 為買家自己的值 → Redeploy → 請買家改完後自己登入驗證（交付後你就不該知道他的密碼）
- [ ] `CONTACT_NOTIFY_TO` 改成買家信箱（如果建置期用的是你的）
- [ ] 教學重點（帶買家走一遍）：
  - [ ] 後台導覽：諮詢紀錄（AI 自動抓聯絡資訊）→ 報價 → 案件看板
  - [ ] `/admin/settings` 四項設定：公司資訊、訂金比例、合約模板、價目表——強調**全部後台改、不用找工程師**
  - [ ] 完整接案流程：AI 客服聊出需求 → 後台核准報價 → 客戶線上接受／簽約／付款全自動 → 案件自動開 → 客戶入口自動更新
  - [ ] 每日自動跟進信（報價未回、合約未簽、款項未付、結案回訪）不用人管
- [ ] 把本文件＋`.env.example` 一併交付，日後搬家／重建照做即可

---

## 常見問題（FAQ）

**改了環境變數沒生效？**
Vercel 的 env 改完必須 **Redeploy** 才生效（Deployments → 最新一筆 → Redeploy）。

**`NEXT_PUBLIC_` 開頭的變數改了，重新整理網頁還是舊值？**
`NEXT_PUBLIC_*` 是 **build 時注入**進前端程式的，不是 runtime 讀取——一樣要 Redeploy（重新 build）才會換新值。

**cron 一直回 401？**
`CRON_SECRET` 沒設（未設一律 401，fail-closed），或你手動測試時沒帶 header。手動觸發要：
`curl -H "Authorization: Bearer <CRON_SECRET>" https://<site>/api/cron/lifecycle`

**AI 客服一開口就說額度用完？**
`ai_rate_check` 函式不存在（schema.sql 沒跑完整）時，限流檢查 fail-closed 會擋下所有 AI 請求。回 Supabase SQL Editor 補跑 schema.sql 裡 `ai_usage`／`ai_rate_check` 那段。

**線上付款按鈕回 503？**
`PCHOMEPAY_APP_ID`／`PCHOMEPAY_SECRET` 未設定。這是預期行為——其餘流程（報價、合約、後台標記匯款收款）全部正常，等買家的 PChomePay 帳號下來再補。

**PChomePay 付款成功但訂單狀態沒變？**
notify 回呼需要**公開可達的網域**（不能是本機或有密碼牆的預覽網址）；另確認付款當下的網站網域＝發起付款的網域。

**交付物上傳失敗？**
最常見是 bucket 沒建或名稱不對：必須是 private bucket、名稱小寫 `deliverables`（步驟①）。單檔超過 4 MB 也會被 app 擋下。

**信寄不出去？**
Resend 網域未驗證（步驟② DNS 三筆），或 `RESEND_FROM` 用了未驗證的網域。到 Resend Dashboard → Emails 看每封信的失敗原因最快。
