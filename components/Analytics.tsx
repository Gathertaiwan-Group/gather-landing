"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/** 全站點擊委派：任何 LINE 連結被點都送 GA 事件 line_click（＝諮詢意圖／轉換）。 */
export default function Analytics() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.('a[href*="line.me"]') as HTMLAnchorElement | null;
      if (a) {
        trackEvent("line_click", {
          link_text: (a.textContent || "").trim().slice(0, 40) || "line",
          page: window.location.pathname,
        });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
