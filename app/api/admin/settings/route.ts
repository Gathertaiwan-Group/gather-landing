import { NextResponse } from "next/server";
import {
  getSetting,
  setSetting,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_CONTRACT_TEMPLATE,
  DEFAULT_DEPOSIT_RATIO,
  type CompanyProfile,
} from "@/lib/settings";
import { getRateCard, type RateItem } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

/** 前端傳來的 company_profile → 消毒成 CompanyProfile（name 必填）。不合法回 null。 */
function coerceCompanyProfile(raw: unknown): CompanyProfile | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? "").trim().slice(0, 100);
  if (!name) return null;
  const opt = (v: unknown, max: number): string | undefined => {
    const s = String(v ?? "").trim().slice(0, max);
    return s || undefined;
  };
  return {
    name,
    taxId: opt(o.taxId, 20),
    email: opt(o.email, 200),
    phone: opt(o.phone, 50),
    bankInfo: opt(o.bankInfo, 500),
  };
}

/** 前端傳來的 rate_card → 消毒成 RateItem[]（每項 name/unit 必填、price>0；key 沿用既有或由名稱轉 slug）。不合法回 null。 */
function coerceRateCardInput(raw: unknown): RateItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const used = new Set<string>();
  const slugKey = (name: string, idx: number): string => {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || `item_${idx + 1}`;
    let key = base;
    let n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    return key;
  };
  const items: RateItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const o = (raw[i] ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 100);
    const unit = String(o.unit ?? "").trim().slice(0, 20);
    // 先四捨五入再驗：避免 0<price<0.5（例如打成 0.3）通過檢查卻被 round 成 0，
    // 讀取端 coerceRateCard 又因 price<=0 丟棄「整份」自訂價目表、靜默退回內建預設。
    const price = Math.round(Number(o.price));
    if (!name || !unit || !Number.isFinite(price) || price < 1 || price > 100_000_000) return null;
    const providedKey = String(o.key ?? "").trim().slice(0, 60);
    const key = providedKey && !used.has(providedKey) ? providedKey : slugKey(name, i);
    used.add(key);
    const note = String(o.note ?? "").trim().slice(0, 300);
    items.push({ key, name, unit, price, ...(note ? { note } : {}) });
  }
  return items;
}

// ── 讀取設定（四個 key，查無回內建預設）──
export async function GET() {
  const [company_profile, deposit_ratio, contract_template, rate_card] = await Promise.all([
    getSetting<CompanyProfile>("company_profile", DEFAULT_COMPANY_PROFILE),
    getSetting<number>("deposit_ratio", DEFAULT_DEPOSIT_RATIO),
    getSetting<string>("contract_template", DEFAULT_CONTRACT_TEMPLATE),
    getRateCard(), // 內含形狀驗證，壞資料自動回內建預設
  ]);
  return NextResponse.json({ ok: true, settings: { company_profile, deposit_ratio, contract_template, rate_card } });
}

// ── 更新設定（帶哪個 key 就存哪個；deposit_ratio 驗 0 < r < 1）──
export async function PUT(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const writes: Array<{ key: string; value: unknown }> = [];

  if (body.deposit_ratio !== undefined) {
    const r = Number(body.deposit_ratio);
    if (!Number.isFinite(r) || r <= 0 || r >= 1) {
      return NextResponse.json(
        { ok: false, error: "invalid_deposit_ratio", message: "訂金比例必須介於 0 與 1 之間（不含），例如 0.3 代表 30%。" },
        { status: 400 }
      );
    }
    writes.push({ key: "deposit_ratio", value: r });
  }

  if (body.company_profile !== undefined) {
    const profile = coerceCompanyProfile(body.company_profile);
    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "invalid_company_profile", message: "公司資訊格式不正確（公司名稱為必填）。" },
        { status: 400 }
      );
    }
    writes.push({ key: "company_profile", value: profile });
  }

  if (body.contract_template !== undefined) {
    const template = String(body.contract_template ?? "");
    if (!template.trim()) {
      return NextResponse.json(
        { ok: false, error: "invalid_contract_template", message: "合約模板不可為空。" },
        { status: 400 }
      );
    }
    writes.push({ key: "contract_template", value: template.slice(0, 50000) });
  }

  if (body.rate_card !== undefined) {
    const items = coerceRateCardInput(body.rate_card);
    if (!items) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_rate_card",
          message: "價目表格式不正確：至少一個項目，每項需有名稱、單位，價格必須大於 0。",
        },
        { status: 400 }
      );
    }
    writes.push({ key: "rate_card", value: items });
  }

  if (writes.length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  for (const w of writes) {
    const saved = await setSetting(w.key, w.value);
    if (!saved) {
      console.error(`[admin/settings] setSetting failed: ${w.key}`);
      return NextResponse.json({ ok: false, error: "save_failed", message: "儲存失敗，請稍後再試。" }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true });
}
