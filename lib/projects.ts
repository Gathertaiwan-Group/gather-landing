import { createServerSupabase } from "@/lib/supabase";

export type Project = {
  cat: string;
  name: string;
  url: string;
  image_url?: string | null;
};

/**
 * 內建作品集（fallback）。
 * 與 reference-build/index.html 的 PROJECTS 陣列一致。
 * Supabase `projects` 表啟用並有資料後，會自動覆蓋這份清單。
 */
export const FALLBACK_PROJECTS: Project[] = [
  { cat: "企業形象官網", name: "聯成外語線上語言學校", url: "https://www.abcgo.com.tw/" },
  { cat: "企業電商官網", name: "台灣宮廷酒廠", url: "https://go.palacetwshop.com/" },
  { cat: "企業形象官網", name: "工富家飾", url: "https://kcasa.pro/" },
  { cat: "企業形象官網", name: "松澄會計師事務所", url: "https://songchencpa.odoo.com/" },
  { cat: "部落客", name: "Three of Us", url: "https://loveccdd.com/" },
  { cat: "線上課程網站", name: "台灣環境生態護育產業工會", url: "https://beunion.tw/" },
];

/**
 * 取得作品集：優先從 Supabase 讀已發佈作品，
 * 若未設定 Supabase 或讀取失敗 / 無資料，回退到內建清單，
 * 確保網站在任何情況下都能正常顯示。
 */
export async function getProjects(): Promise<Project[]> {
  const supabase = createServerSupabase();
  if (!supabase) return FALLBACK_PROJECTS;

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("category, name, url, image_url")
      .eq("published", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) return FALLBACK_PROJECTS;

    return data.map((row) => ({
      cat: row.category as string,
      name: row.name as string,
      url: row.url as string,
      image_url: (row.image_url as string | null) ?? null,
    }));
  } catch {
    return FALLBACK_PROJECTS;
  }
}
