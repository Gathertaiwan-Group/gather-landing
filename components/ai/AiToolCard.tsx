"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

const BRAND_BLUE = "#1668c2";

export type ToolConfig = {
  tool: string;
  num: string;
  title: string;
  subtitle: string;
  inputKind: "text" | "textarea" | "none";
  placeholder?: string;
  cta: string;
  runNote?: string; // for none-input tools, a hint of what will run
};

export default function AiToolCard(cfg: ToolConfig) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    if (cfg.inputKind !== "none" && !value.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: cfg.tool, input: value }),
      });
      const data = await res.json();
      if (data.ok) setResult(data.result);
      else setError(data.message || "AI 暫時無法回應，請稍後再試。");
    } catch {
      setError("連線出了點問題，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 24,
        padding: "clamp(24px,4vw,34px)",
        boxShadow: "0 8px 30px rgba(20,40,80,.07)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".06em", color: BRAND_BLUE, marginBottom: 12 }}>
        {cfg.num}
      </div>
      <h3 style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 22, letterSpacing: "-.015em", color: "#1d1d1f" }}>
        {cfg.title}
      </h3>
      <p style={{ margin: "0 0 18px", fontSize: 15, lineHeight: 1.65, color: "#6e6e73" }}>{cfg.subtitle}</p>

      {cfg.inputKind === "text" && (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder={cfg.placeholder}
          maxLength={300}
          style={inputStyle}
        />
      )}
      {cfg.inputKind === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={cfg.placeholder}
          maxLength={800}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      )}
      {cfg.inputKind === "none" && cfg.runNote && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#9aa3b0" }}>{cfg.runNote}</p>
      )}

      <button
        onClick={run}
        disabled={loading || (cfg.inputKind !== "none" && !value.trim())}
        style={{
          alignSelf: "flex-start",
          marginTop: cfg.inputKind === "none" ? 0 : 12,
          border: "none",
          borderRadius: 980,
          padding: "11px 26px",
          fontSize: 15,
          fontWeight: 500,
          color: "#fff",
          background: BRAND_BLUE,
          cursor: loading ? "default" : "pointer",
          opacity: loading || (cfg.inputKind !== "none" && !value.trim()) ? 0.55 : 1,
        }}
      >
        {loading ? "AI 生成中…" : cfg.cta}
      </button>

      {error && (
        <div style={{ marginTop: 18, fontSize: 14, color: "#c0392b", background: "#fdecea", padding: "12px 16px", borderRadius: 12 }}>
          {error}
        </div>
      )}
      {result && (
        <div
          className="prose gt-ai-result"
          style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(0,0,0,.08)", fontSize: 15 }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {result}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(0,0,0,.14)",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 15,
  outline: "none",
  color: "#1d1d1f",
};
