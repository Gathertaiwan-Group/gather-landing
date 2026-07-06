// 給樂數位服務「價目表 / 費率卡」——AI 報價只能依此組價，不得自行發明價格。
// ⚠️ 目前為「暫定參考價」佔位值，實際數字待老闆提供後替換。
// v1 用程式常數（改價要重新部署）；日後可改成 DB 表 + 後台編輯。

export type RateItem = {
  key: string;
  name: string;
  unit: string; // 式 | 年 | 月 | 頁 | 次…
  price: number; // 參考價 / 起價（新台幣）
  note?: string;
};

export const RATE_CARD: RateItem[] = [
  { key: "brand_site", name: "品牌形象官網建置", unit: "式", price: 80000, note: "RWD、約 5–8 頁、基本 SEO" },
  { key: "ecommerce_site", name: "電商網站建置", unit: "式", price: 150000, note: "商品/購物車/會員系統" },
  { key: "ai_crm", name: "AI CRM 系統客製化開發", unit: "式", price: 200000, note: "會員/客戶管理 + AI 分析與自動化" },
  { key: "payment_logistics", name: "金流／物流串接", unit: "式", price: 30000 },
  { key: "einvoice", name: "電子發票串接", unit: "式", price: 20000 },
  { key: "blog_cms", name: "部落格／內容管理系統", unit: "式", price: 25000 },
  { key: "hosting_maintenance", name: "網站代管與維護", unit: "年", price: 24000, note: "伺服器、資安、備份、效能" },
  { key: "seo_consulting", name: "SEO／數位行銷顧問", unit: "月", price: 20000 },
];

export const CURRENCY = "TWD";
export const DEFAULT_VALID_DAYS = 14;

/** 給 Gemini prompt 用的文字版價目表。 */
export const RATE_CARD_TEXT = RATE_CARD.map(
  (r) => `- ${r.name}（單位：${r.unit}，參考價 NT$${r.price.toLocaleString("en-US")}）${r.note ? "：" + r.note : ""}`
).join("\n");
