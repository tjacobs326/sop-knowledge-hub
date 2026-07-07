import { jsonResponse, type PagesFunctionContext } from "./cloudflare";

export type ApiRole = "normal" | "creator" | "admin";

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  message?: string;
}

export function success<T>(data: T, message?: string, status = 200, init?: ResponseInit) {
  return new Response(JSON.stringify({ success: true, data, message } satisfies ApiSuccessBody<T>), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": init?.headers ? new Headers(init.headers).get("cache-control") || "no-store" : "no-store",
    },
  });
}

export function failure(
  code: string,
  message: string,
  status = 400,
  fields: Record<string, string> = {},
) {
  return jsonResponse(
    {
      success: false,
      error: {
        code,
        message,
        fields,
      },
    } satisfies ApiErrorBody,
    status,
  );
}

export function cacheHeaders(kind: "public" | "private" = "private") {
  return {
    "cache-control": kind === "public" ? "public, max-age=60, stale-while-revalidate=120" : "no-store",
  };
}

export function roleFromRequest(request: Request): ApiRole {
  const hostname = new URL(request.url).hostname;
  const allowDevRoleOverride = hostname === "127.0.0.1" || hostname === "localhost";
  const raw =
    (allowDevRoleOverride
      ? request.headers.get("x-sop-role") ||
        request.headers.get("x-user-role") ||
        new URL(request.url).searchParams.get("role")
      : "") ||
    "normal";
  const normalized = raw.toLowerCase();
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("creator") || normalized.includes("reviewer")) return "creator";
  return "normal";
}

export function requireRole(request: Request, allowed: ApiRole[]) {
  const role = roleFromRequest(request);
  if (allowed.includes(role)) return null;
  return failure("FORBIDDEN", "You do not have permission to perform this action.", 403);
}

export async function readBody<T>(request: Request) {
  try {
    return [(await request.json()) as T, null] as const;
  } catch {
    return [null, failure("INVALID_JSON", "Send a valid JSON request body.", 400)] as const;
  }
}

export function getRouteParam(context: PagesFunctionContext, key: string) {
  const maybeParams = (context as PagesFunctionContext & { params?: Record<string, string | string[]> }).params;
  const value = maybeParams?.[key];
  return Array.isArray(value) ? value[0] : value || "";
}

export function requiredText(value: unknown, maxLength: number) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function optionalText(value: unknown, maxLength: number) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function unixNow() {
  return Math.floor(Date.now() / 1000);
}

export function unixFromDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value).includes("T") ? String(value) : `${String(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
}

export function publicStatus(status: unknown) {
  return String(status || "").toLowerCase() === "published";
}
