"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { token: string };

/**
 * 合約簽署區（公開頁 /contract/<token> 用）：
 * 姓名 + 「我已閱讀並同意」checkbox → POST /api/contract/sign。
 * 成功後拿 API 回的 payToken 直接導向 /pay/<payToken>（訂金付款頁）；
 * 沒有 payToken（例如訂金單建立失敗）則 refresh 讓 server 重渲染成已簽署狀態。
 */
export default function SignBox({ token }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function sign() {
    if (state === "loading" || state === "done") return;
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg("請填寫您的姓名");
      setState("error");
      return;
    }
    if (!agreed) {
      setErrorMsg("請先勾選「我已閱讀並同意以上條款」");
      setState("error");
      return;
    }
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; payToken?: string | null } | null;
      if (res.ok && data?.ok) {
        setState("done");
        if (data.payToken) {
          router.push(`/pay/${data.payToken}`);
        } else {
          router.refresh();
        }
      } else if (res.status === 410) {
        setErrorMsg("此合約已失效，請聯絡我們。");
        setState("error");
      } else if (res.status === 400) {
        setErrorMsg("請填寫您的姓名後再簽署。");
        setState("error");
      } else {
        setErrorMsg("簽署失敗，請重新整理再試，或直接聯絡我們。");
        setState("error");
      }
    } catch {
      setErrorMsg("簽署失敗，請重新整理再試，或直接聯絡我們。");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="gt-quote-banner gt-quote-banner-ok" role="status">
        ✅ 簽署完成！正在為您準備訂金付款頁…
      </div>
    );
  }

  return (
    <div className="gt-contract-signbox">
      <p className="gt-contract-signbox-title">線上簽署</p>
      <div className="gt-contract-field">
        <label className="gt-contract-label" htmlFor="gt-signer-name">
          簽署人姓名
        </label>
        <input
          id="gt-signer-name"
          className="gt-contract-input"
          type="text"
          value={name}
          maxLength={100}
          placeholder="請輸入您的姓名"
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <label className="gt-contract-agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>我已閱讀並同意以上條款，並了解本合約以電子方式簽署，與書面簽署具同等效力。</span>
      </label>
      <div className="gt-quote-actions" style={{ margin: "4px 0 0" }}>
        <button
          type="button"
          onClick={sign}
          disabled={state === "loading"}
          className="gt-quote-accept"
          aria-busy={state === "loading"}
        >
          {state === "loading" ? "簽署中…" : "同意並簽署合約"}
        </button>
        {state === "error" && errorMsg && (
          <p className="gt-quote-error" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}
