import { jsonResponse, newId, safeJsonParse, type D1DatabaseBinding } from "./cloudflare";

export type AccessLevel = "Normal User" | "Creator / Reviewer" | "Admin";
export type UserStatus = "Active" | "Pending" | "Suspended" | "Archived";

export function requireDb(db: D1DatabaseBinding | undefined) {
  if (!db) return jsonResponse({ error: "D1 database binding DB is not available." }, 503);
  return null;
}

export function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function idFrom(value: string, prefix: string) {
  const slug = slugify(value, "");
  return slug ? `${prefix}-${slug}` : newId(prefix);
}

export async function readJsonBody<T>(request: Request) {
  try {
    return [(await request.json()) as T, null] as const;
  } catch {
    return [null, jsonResponse({ error: "Send valid JSON." }, 400)] as const;
  }
}

export function listFromJson(value: string | null) {
  return safeJsonParse<string[]>(value, []);
}
