import type { DraftGenerator } from "./shared";
import { siteCopyGenerator } from "./siteCopy";
import { sitemapGenerator } from "./sitemap";
import { designBriefGenerator } from "./designBrief";

// P2 AI 初稿 generator 註冊表。
// 新增一種初稿：寫一個 generator 檔（照 siteCopy.ts 樣式）→ 加進 GENERATORS 即完成接線
// （/api/admin/cases/generate-drafts 會自動逐個跑 appliesTo → generate → 建 draft 交付物）。

export { aiDraftTitle } from "./shared";
export type { DraftGenerator, GeneratorContext, GeneratorKey, DraftResult } from "./shared";

export const GENERATORS: DraftGenerator[] = [siteCopyGenerator, sitemapGenerator, designBriefGenerator];
