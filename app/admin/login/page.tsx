"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BRAND_BLUE = "#1668c2";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        const next = params.get("next");
        router.replace(next && next.startsWith("/admin") ? next : "/admin");
      } else {
        setError(data.message || "登入失敗，請稍後再試。");
      }
    } catch {
      setError("連線出了點問題，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#fff",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 8px 30px rgba(20,40,80,.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="給樂數位" width={28} height={28} style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: "#1d1d1f" }}>給樂數位 後台</span>
        </div>
        <p style={{ fontSize: 14, color: "#6e6e73", margin: "0 0 20px" }}>請輸入管理密碼登入。</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理密碼"
          autoFocus
          style={{
            width: "100%",
            border: "1px solid rgba(0,0,0,.14)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 15,
            outline: "none",
            marginBottom: 14,
            boxSizing: "border-box",
          }}
        />
        {error && (
          <div
            style={{
              fontSize: 14,
              color: "#c0392b",
              background: "#fdecea",
              padding: "10px 14px",
              borderRadius: 10,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 980,
            padding: "12px 20px",
            fontSize: 15,
            fontWeight: 600,
            color: "#fff",
            background: BRAND_BLUE,
            cursor: loading ? "default" : "pointer",
            opacity: loading || !password ? 0.6 : 1,
          }}
        >
          {loading ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
