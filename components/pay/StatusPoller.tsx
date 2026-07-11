"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * 付款完成返回頁（/pay/<token>?done=1）且款項仍 pending 時掛載：
 * 每 5 秒 router.refresh() 重新拉 server 渲染，最多 24 次（約 2 分鐘）。
 * 付款入帳後 server 重渲染成已付款畫面（本元件不再被渲染）即自動停止。
 */
export default function StatusPoller() {
  const router = useRouter();
  const count = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      count.current += 1;
      if (count.current > 24) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
