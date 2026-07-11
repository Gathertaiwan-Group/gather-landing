import { createAdminSupabase } from "@/lib/supabase";

// 系統設定（settings 表 key/value jsonb）。P0 使用的 keys：
//   company_profile   → CompanyProfile
//   contract_template → string（合約 Markdown 模板）
//   deposit_ratio     → number（0~1 之間的訂金比例）

/** 公司基本資料（合約抬頭／信件署名用；後台「設定」頁可編輯）。 */
export type CompanyProfile = { name: string; taxId?: string; email?: string; phone?: string; bankInfo?: string };

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = { name: "給樂數位" };

/** 預設訂金比例（總價的 0~1）。 */
export const DEFAULT_DEPOSIT_RATIO = 0.5;

/**
 * 內建繁中委託開發合約模板。placeholders（renderContractMd 替換）：
 * {{contract_no}} {{date}} {{client_name}} {{company_name}} {{quote_no}} {{quote_title}}
 * {{line_items}}（markdown 表格）{{subtotal}} {{tax}} {{total}}
 * {{deposit_amount}} {{final_amount}} {{deposit_ratio_percent}}（純數字，如 50）
 */
export const DEFAULT_CONTRACT_TEMPLATE = `# 軟體委託開發服務合約

- 合約編號：{{contract_no}}
- 簽立日期：{{date}}

立合約書人：

- 委託方（以下稱「甲方」）：{{client_name}}
- 受託方（以下稱「乙方」）：{{company_name}}

甲方委託乙方進行「{{quote_title}}」之開發服務（報價單編號：{{quote_no}}），雙方合意訂立條款如下：

## 第一條　委託內容與範圍

乙方依報價單 {{quote_no}} 所列項目提供開發服務：

{{line_items}}

- 小計：{{subtotal}}
- 稅額：{{tax}}
- **總價：{{total}}**

實際功能細節以雙方確認之需求為準；超出上述範圍之新增需求，得由雙方另行議價追加。

## 第二條　付款方式

1. 簽約訂金：本合約完成簽署後，甲方應支付總價 {{deposit_ratio_percent}}% 之訂金 {{deposit_amount}}；乙方於收到訂金後開始執行專案。
2. 驗收尾款：專案完成並經甲方驗收後，甲方應支付尾款 {{final_amount}}。
3. 付款方式：依乙方提供之線上付款連結或指定匯款帳戶支付。

## 第三條　交付與驗收

1. 乙方完成開發後通知甲方驗收；甲方應於收到通知後 7 個工作天內完成驗收或提出具體修改意見。
2. 甲方逾期未回覆且無正當理由者，視為驗收通過。
3. 驗收階段之修改以原確認需求範圍內為限，並以 2 次為原則；範圍外之新增功能另行報價。

## 第四條　智慧財產權

尾款付清後，本專案交付成果之著作財產權歸甲方所有；乙方保留開發過程所使用之通用元件、程式庫、框架與工具之權利，並得於不揭露甲方機密之前提下，將本專案列為實績展示。

## 第五條　保密義務

雙方因本合約知悉他方之營業祕密與未公開資訊，非經他方書面同意，不得洩漏予第三人或作本合約目的以外之使用。

## 第六條　其他約定

1. 本合約未盡事宜，雙方應本誠實信用原則協商解決。
2. 因本合約涉訟時，雙方合意以乙方所在地之地方法院為第一審管轄法院。
3. 本合約以電子方式簽署，與書面簽署具同等之效力。
`;

/** 讀取設定（settings 表 key/value jsonb）；查無、值為 null 或出錯一律回 fallback。 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createAdminSupabase();
  if (!supabase || !key) return fallback;
  try {
    const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
    if (error || !data) return fallback;
    return (data.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/** 寫入設定（upsert）；成功回 true。 */
export async function setSetting(key: string, value: unknown): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase || !key) return false;
  try {
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return !error;
  } catch {
    return false;
  }
}
