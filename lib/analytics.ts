// GA4 事件輔助（client 端；未載入 gtag 時安全 no-op）。
type GtagParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params: GtagParams = {}): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag === "function") w.gtag("event", name, params);
}
