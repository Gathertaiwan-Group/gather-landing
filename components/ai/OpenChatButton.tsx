"use client";

const BRAND_BLUE = "#1668c2";

export default function OpenChatButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("gather:open-chat"))}
      style={{
        alignSelf: "flex-start",
        border: "none",
        borderRadius: 980,
        padding: "11px 26px",
        fontSize: 15,
        fontWeight: 500,
        color: "#fff",
        background: BRAND_BLUE,
        cursor: "pointer",
      }}
    >
      開啟 AI 助理對話
    </button>
  );
}
