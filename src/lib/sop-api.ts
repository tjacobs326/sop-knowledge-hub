export interface D1SopRecord {
  id?: string;
  title?: string;
  slug?: string;
  summary?: string;
  purpose?: string;
  category?: string;
  categorySlug?: string;
  owner?: string;
  status?: string;
  tags?: string[];
  tools?: string[];
  audience?: string[];
  reviewDate?: string;
  reviewDueAt?: string;
  updatedAt?: string;
  lastUpdated?: string;
  publishedAt?: string;
  sourceType?: string;
  bodyMarkdown?: string;
  viewCount?: number;
  helpfulCount?: number;
  notHelpfulCount?: number;
  version?: {
    content?: string;
    summary?: string;
    beforeYouBegin?: string;
    troubleshooting?: string;
    number?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface NormalizedSop {
  id: string;
  title: string;
  slug: string;
  category: string;
  categorySlug: string;
  status: string;
  owner: string;
  updatedAt: string;
  reviewDate: string;
  tags: string[];
  tools: string[];
  audience: string[];
  summary: string;
  purpose: string;
  body: string;
  sourceType: string;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  detailUrl: string;
}

export interface NormalizedCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  sopCount: number;
  detailUrl: string;
}

interface SopListOptions {
  limit?: number;
  sort?: "recent" | "popular" | "title" | "oldest";
  status?: string;
  category?: string;
  search?: string;
}

function unwrapArray<T>(payload: unknown, key: string): T[] {
  const body = payload as Record<string, unknown>;
  const direct = body[key];
  const nested = (body.data as Record<string, unknown> | undefined)?.[key];
  const value = Array.isArray(direct) ? direct : nested;
  return Array.isArray(value) ? (value as T[]) : [];
}

async function fetchJson(path: string) {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sopDetailUrl(sop: Pick<D1SopRecord, "slug" | "id">) {
  if (sop.slug) return `/sops/detail/?slug=${encodeURIComponent(sop.slug)}`;
  return `/sops/detail/?id=${encodeURIComponent(String(sop.id || ""))}`;
}

export function normalizeSop(record: D1SopRecord): NormalizedSop {
  const title = String(record.title || "Untitled SOP");
  const summary = String(record.summary || record.purpose || record.version?.summary || "");
  const body = String(record.version?.content || record.bodyMarkdown || record.purpose || summary || "");
  const category = String(record.category || "Uncategorized");
  const slug = String(record.slug || slugify(title));
  const updatedAt = String(record.updatedAt || record.lastUpdated || record.publishedAt || "");
  const reviewDate = String(record.reviewDate || record.reviewDueAt || "");

  return {
    id: String(record.id || slug),
    title,
    slug,
    category,
    categorySlug: String(record.categorySlug || slugify(category)),
    status: String(record.status || "Published"),
    owner: String(record.owner || "Unassigned"),
    updatedAt,
    reviewDate,
    tags: asArray(record.tags),
    tools: asArray(record.tools),
    audience: asArray(record.audience),
    summary,
    purpose: String(record.purpose || summary),
    body,
    sourceType: String(record.sourceType || "Database"),
    viewCount: Number(record.viewCount || 0),
    helpfulCount: Number(record.helpfulCount || 0),
    notHelpfulCount: Number(record.notHelpfulCount || 0),
    detailUrl: sopDetailUrl({ id: record.id, slug }),
  };
}

export function normalizeCategory(record: Record<string, unknown>): NormalizedCategory {
  const name = String(record.name || "Uncategorized");
  const slug = String(record.slug || slugify(name));
  return {
    id: String(record.id || slug),
    name,
    slug,
    description: String(record.description || "Browse related SOPs and guidance."),
    icon: String(record.icon || "document"),
    color: String(record.color || "#e8f1ff"),
    sopCount: Number(record.sopCount || record.count || 0),
    detailUrl: `/categories/detail/?slug=${encodeURIComponent(slug)}`,
  };
}

export function toSearchRecord(sop: NormalizedSop) {
  return {
    id: sop.id,
    title: sop.title,
    purpose: sop.purpose || sop.summary,
    category: sop.category,
    tags: sop.tags,
    tools: sop.tools,
    owner: sop.owner,
    audience: sop.audience,
    status: sop.status,
    lastUpdated: sop.updatedAt,
    reviewDate: sop.reviewDate,
    url: sop.detailUrl,
    body: sop.body,
    relatedSops: [],
  };
}

export async function fetchD1Sops(options: SopListOptions & { offset?: number } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));
  if (options.sort) params.set("sort", options.sort);
  if (options.status) params.set("status", options.status);
  if (options.category) params.set("category", options.category);
  if (options.search) params.set("q", options.search);

  const payload = await fetchJson(`/api/sops?${params.toString()}`);
  return unwrapArray<D1SopRecord>(payload, "sops").map(normalizeSop);
}

export async function fetchAllD1Sops(options: SopListOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const records: NormalizedSop[] = [];
  let offset = 0;

  while (true) {
    const batch = await fetchD1Sops({ ...options, limit, offset });
    records.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return records;
}

export async function fetchRecentD1Sops(limit = 10) {
  const payload = await fetchJson(`/api/sops/recent?limit=${encodeURIComponent(String(limit))}`);
  return unwrapArray<D1SopRecord>(payload, "sops").map(normalizeSop);
}

export async function fetchPopularD1Sops(limit = 10) {
  const payload = await fetchJson(`/api/sops/popular?limit=${encodeURIComponent(String(limit))}`);
  return unwrapArray<D1SopRecord>(payload, "sops").map(normalizeSop);
}

export async function fetchD1Categories() {
  const payload = await fetchJson("/api/categories");
  return unwrapArray<Record<string, unknown>>(payload, "categories").map(normalizeCategory);
}

export async function fetchAnalyticsSummary() {
  return fetchJson("/api/analytics/summary");
}
