"use client";

import { useState } from "react";

type Props = { token: string };

export default function AcceptButton({ token }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function accept() {
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      const res = await fetch("/api/quote/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (res.ok && data?.ok) {
        setState("done");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="gt-quote-banner gt-quote-banner-ok" role="status">
        ✅ 已接受，謝謝！我們會盡快與您聯繫。
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={accept}
        disabled={state === "loading"}
        className="gt-quote-accept"
        aria-busy={state === "loading"}
      >
        {state === "loading" ? "處理中…" : "接受報價"}
      </button>
      {state === "error" && (
        <p className="gt-quote-error" role="alert">
          操作失敗，請重新整理再試，或直接聯絡我們。
        </p>
      )}
    </div>
  );
}
