"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { token: string; deliverableId: string; isFinal: boolean };

type Mode = "idle" | "approve" | "reject";

/**
 * 交付物驗收鈕（status='delivered' 時由 portal 頁渲染）：
 * - 驗收通過：先展開確認（is_final 額外提示會進入尾款結算）→ POST approve。
 *   成功且 finalTriggered → 顯示「已驗收！尾款請款信將寄至您的信箱」。
 * - 要求修改：必填修改意見（空值前端擋、後端也 400）→ POST reject。
 * 成功訊息停留數秒後 router.refresh()，由 server 重新渲染最新狀態。
 */
export default function ReviewButtons({ token, deliverableId, isFinal }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(action: "approve" | "reject") {
    if (loading || doneMsg) return;
    const text = feedback.trim();
    if (action === "reject" && !text) {
      setErrorMsg("請填寫需要修改的地方，我們才能對症調整。");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/portal/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reject"
            ? { token, id: deliverableId, action, feedback: text }
            : { token, id: deliverableId, action }
        ),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; finalTriggered?: boolean }
        | null;
      if (res.ok && data?.ok) {
        if (action === "approve") {
          setDoneMsg(data.finalTriggered ? "已驗收！尾款請款信將寄至您的信箱。" : "已驗收通過，感謝您的確認！");
        } else {
          setDoneMsg("已送出修改要求，我們會盡快調整後再請您確認。");
        }
        // 成功訊息先停留，再刷新讓 server 呈現最新狀態（chip／feed）。
        setTimeout(() => router.refresh(), 3000);
      } else if (res.status === 400) {
        setErrorMsg("請填寫修改意見後再送出。");
      } else {
        setErrorMsg("操作未成功，請重新整理頁面再試，或直接聯絡我們。");
      }
    } catch {
      setErrorMsg("操作未成功，請重新整理頁面再試，或直接聯絡我們。");
    } finally {
      setLoading(false);
    }
  }

  if (doneMsg) {
    return (
      <div className="gt-portal-review">
        <div className="gt-quote-banner gt-quote-banner-ok" role="status">
          ✅ {doneMsg}
        </div>
      </div>
    );
  }

  return (
    <div className="gt-portal-review">
      {mode === "idle" && (
        <div className="gt-portal-review-row">
          <button type="button" className="gt-portal-btn" onClick={() => { setErrorMsg(""); setMode("approve"); }}>
            驗收通過
          </button>
          <button
            type="button"
            className="gt-portal-btn gt-portal-btn--ghost"
            onClick={() => { setErrorMsg(""); setMode("reject"); }}
          >
            要求修改
          </button>
        </div>
      )}

      {mode === "approve" && (
        <>
          <p className="gt-portal-review-note">
            確認驗收通過這項交付物？
            {isFinal && "此為最終交付，驗收通過後我們將寄出尾款請款信。"}
          </p>
          <div className="gt-portal-review-row">
            <button
              type="button"
              className="gt-portal-btn"
              onClick={() => submit("approve")}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "送出中…" : "確認驗收通過"}
            </button>
            <button
              type="button"
              className="gt-portal-btn gt-portal-btn--ghost"
              onClick={() => { setErrorMsg(""); setMode("idle"); }}
              disabled={loading}
            >
              取消
            </button>
          </div>
        </>
      )}

      {mode === "reject" && (
        <>
          <textarea
            className="gt-portal-textarea"
            value={feedback}
            maxLength={2000}
            placeholder="請告訴我們需要修改的地方（必填，最多 2000 字）"
            aria-label="修改意見"
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="gt-portal-review-row">
            <button
              type="button"
              className="gt-portal-btn"
              onClick={() => submit("reject")}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "送出中…" : "送出修改要求"}
            </button>
            <button
              type="button"
              className="gt-portal-btn gt-portal-btn--ghost"
              onClick={() => { setErrorMsg(""); setMode("idle"); }}
              disabled={loading}
            >
              取消
            </button>
          </div>
        </>
      )}

      {errorMsg && (
        <p className="gt-quote-error" style={{ textAlign: "left" }} role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
