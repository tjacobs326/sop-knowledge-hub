export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return replacements[character];
  });
}

export function apiErrorMessage(data: unknown, fallback: string) {
  const payload = data as { error?: string | { message?: string } } | null;
  if (typeof payload?.error === "string" && payload.error) return payload.error;
  if (payload?.error && typeof payload.error === "object" && payload.error.message) return payload.error.message;
  return fallback;
}

export function formatClientDate(value: unknown, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function safeInternalPath(value: string, allowedPathname: string, fallback: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname === allowedPathname
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
