# 部落格發文 API（給 hermes agent）

讓 hermes agent 自動上架文章到 https://gathertaiwan.com/blog。

## 認證
所有請求需帶 header：
```
Authorization: Bearer <BLOG_API_TOKEN>
Content-Type: application/json
```
`BLOG_API_TOKEN` 是設定在 Vercel 環境變數的密鑰（請向網站管理者索取，勿外流）。
缺 token 或不符 → `401 { "ok": false, "error": "unauthorized" }`。

端點：`POST https://gathertaiwan.com/api/blog`

---

## 1. 發表文章 — `POST /api/blog`

### Body 欄位
| 欄位 | 必填 | 說明 |
|---|---|---|
| `title` | ✅ | 文章標題 |
| `content` | ✅ | 內文，**Markdown** 格式（支援 GFM：標題/粗體/清單/引用/連結/程式碼/表格/圖片）|
| `category` | 建議 | `"數位行銷"` 或 `"AI 賦能"`（用於分類篩選）|
| `excerpt` | 建議 | 摘要（列表卡片與 SEO description 用）|
| `cover_url` | 選 | 封面圖網址。**留空則自動配圖**：系統會用 `cover_query`（或 title）向 Pexels 抓一張情境照並自動標註攝影師 |
| `cover_query` | 選 | 自動配圖的搜尋關鍵字（建議**英文**，如 `ai customer service`、`ecommerce shopping`）。只有在沒給 `cover_url` 時生效 |
| `author` | 選 | 預設 `給樂數位 Gather` |
| `slug` | 選 | 不給則由 title 自動產生（中文會保留；碰撞自動加 `-2`）|
| `published` | 選 | 預設 `true`。設 `false` = 草稿（不公開）|
| `published_at` | 選 | ISO 時間，預設「現在」。**設未來時間 = 排程**：到時間才自動上線 |

### 範例
```bash
curl -X POST https://gathertaiwan.com/api/blog \
  -H "Authorization: Bearer $BLOG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "AI 賦能的客戶關係管理",
    "category": "AI 賦能",
    "excerpt": "導入 AI 到 CRM，讓每一次互動更聰明。",
    "cover_url": "https://.../cover.jpg",
    "content": "## 為什麼需要 AI\n\n傳統 CRM 記錄資料，**AI CRM 預測行為**。\n\n- 流失預警\n- 內容個人化\n\n> 數據驅動每一次決策。"
  }'
```

### 回應
```json
{ "ok": true, "id": "<uuid>", "slug": "ai-賦能的客戶關係管理",
  "url": "https://gathertaiwan.com/blog/ai-賦能的客戶關係管理" }
```
成功後網站 `/blog`、首頁與該文頁會**即時更新**（已自動 revalidate）。

---

## 2. 更新 / 下架 — `PATCH /api/blog`
以 `id` 或 `slug` 指定，帶要更新的欄位。下架＝ `"published": false`。
```bash
curl -X PATCH https://gathertaiwan.com/api/blog \
  -H "Authorization: Bearer $BLOG_API_TOKEN" -H "Content-Type: application/json" \
  -d '{ "slug": "ai-賦能的客戶關係管理", "published": false }'
```

## 3. 列出近期文章 — `GET /api/blog`
供 agent 檢查既有 slug、避免重複。
```bash
curl https://gathertaiwan.com/api/blog -H "Authorization: Bearer $BLOG_API_TOKEN"
```

---

## 排程「定期上架」建議
agent 可一次產多篇、各設不同未來 `published_at`（例如每週一篇），文章會在各自時間自動公開——不需要 agent 當下在線。

## 錯誤碼
| 狀態 | 意義 |
|---|---|
| 401 | token 錯誤/缺少 |
| 422 | 缺 `title`/`content` |
| 409 | slug 衝突（極少；通常自動加後綴）|
| 503 | 後端未設定（Supabase env）|
| 500 | DB 錯誤 |
