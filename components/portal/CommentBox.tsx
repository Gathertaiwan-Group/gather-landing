"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { token: string };

/**
 * 客戶留言框（公開頁 /portal/<token> 用）：
 * textarea → POST /api/portal/comment。成功後清空、router.refresh() 讓動態 feed 立即出現新留言。
 */
export default function CommentBox({ token }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit() {
    if (loading) return;
    const text = body.trim();
    if (!text) {
      setOkMsg("");
      setErrorMsg("請先輸入留言內容。");
      return;
    }
    setLoading(true);
    setOkMsg("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/portal/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, body: text }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (res.ok && data?.ok) {
        setBody("");
        setOkMsg("留言已送出，我們收到後會盡快回覆您。");
        router.refresh();
      } else if (res.status === 429) {
        setErrorMsg("留言太頻繁，請稍後再試。");
      } else if (res.status === 400) {
        setErrorMsg("請輸入留言內容（最多 2000 字）。");
      } else {
        setErrorMsg("留言送出失敗，請稍後再試，或直接聯絡我們。");
      }
    } catch {
      setErrorMsg("留言送出失敗，請稍後再試，或直接聯絡我們。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gt-portal-commentbox">
      <textarea
        className="gt-portal-textarea"
        value={body}
        maxLength={2000}
        placeholder="有任何想法或問題，直接留言給我們（最多 2000 字）"
        aria-label="留言內容"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="gt-portal-commentbox-actions">
        <button
          type="button"
          className="gt-portal-btn"
          onClick={submit}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? "送出中…" : "送出留言"}
        </button>
        {okMsg && (
          <p className="gt-portal-ok" role="status">
            {okMsg}
          </p>
        )}
        {errorMsg && (
          <p className="gt-quote-error" style={{ textAlign: "left" }} role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}
