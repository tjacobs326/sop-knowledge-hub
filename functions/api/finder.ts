import { failure, readBody, success } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { type PagesFunctionContext } from "../_shared/cloudflare";
import { listSops } from "../_shared/sop-data";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

interface FinderRequestBody {
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
}

interface FinderCriteria {
  needsFollowUp?: boolean;
  followUpQuestion?: string;
  role?: string;
  department?: string;
  taskIntent?: string;
  systemTool?: string;
  keywords?: string[];
  category?: string;
  confidence?: number;
}

interface WorkersAiTextResponse {
  response?: string;
  result?: {
    response?: string;
  };
}

const stopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "for",
  "from",
  "have",
  "help",
  "how",
  "into",
  "need",
  "that",
  "the",
  "this",
  "what",
  "when",
  "where",
  "with",
  "you",
]);

function extractAiText(value: unknown) {
  if (typeof value === "string") return value;
  const response = value as WorkersAiTextResponse;
  const text = response.response || response.result?.response || "";
  return typeof text === "string" ? text : JSON.stringify(text);
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as FinderCriteria;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as FinderCriteria;
    } catch {
      return {};
    }
  }
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function textList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fallbackCriteria(message: string): FinderCriteria {
  const keywords = Array.from(new Set(tokenize(message))).slice(0, 8);
  return {
    needsFollowUp: keywords.length < 2,
    followUpQuestion: keywords.length < 2 ? "What task, system, or process are you trying to complete?" : "",
    taskIntent: message,
    keywords,
    confidence: keywords.length < 2 ? 30 : 55,
  };
}

function buildCriteriaPrompt(message: string, history: FinderRequestBody["history"]) {
  const recentHistory = (history || [])
    .slice(-6)
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${String(item.content || "").slice(0, 500)}`)
    .join("\n");

  return `You classify a normal user's SOP-finding request.
Return only valid compact JSON with these keys:
needsFollowUp boolean
followUpQuestion string
role string
department string
taskIntent string
systemTool string
keywords array of strings
category string
confidence number from 0 to 100

Ask for one follow-up only if the user's request does not include enough task/system/process detail to search SOPs.
Do not invent SOP titles.

Conversation:
${recentHistory || "(none)"}

Latest user request:
${message}`;
}

async function classifyWithAi(env: PagesFunctionContext["env"], message: string, history: FinderRequestBody["history"]) {
  if (!env.AI) return fallbackCriteria(message);

  const aiResult = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content:
          "You extract structured search criteria for an SOP finder. Return JSON only. Never recommend SOPs.",
      },
      { role: "user", content: buildCriteriaPrompt(message, history) },
    ],
    max_tokens: 500,
    temperature: 0.1,
  });

  const parsed = parseJsonObject(extractAiText(aiResult));
  const fallback = fallbackCriteria(message);
  const keywords = Array.from(
    new Set([...textList(parsed.keywords), ...tokenize([parsed.taskIntent, parsed.systemTool, parsed.category].join(" "))]),
  ).slice(0, 10);

  const hasSearchableDetail = (fallback.keywords || []).length >= 3 || keywords.length >= 3;

  return {
    ...fallback,
    ...parsed,
    needsFollowUp: hasSearchableDetail ? false : Boolean(parsed.needsFollowUp ?? fallback.needsFollowUp),
    keywords: keywords.length ? keywords : fallback.keywords,
  };
}

async function fetchPublishedSops(db: NonNullable<PagesFunctionContext["env"]["DB"]>) {
  const records = [];
  let offset = 0;
  const limit = 100;

  while (offset < 600) {
    const batch = await listSops(db, { limit, offset, sort: "recent", publicOnly: true });
    records.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }

  return records;
}

function sopUrl(sop: Record<string, unknown>) {
  if (sop.slug) return `/sops/detail/?slug=${encodeURIComponent(String(sop.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(sop.id || ""))}`;
}

function searchableText(sop: Record<string, unknown>) {
  const version = (sop.version || {}) as Record<string, unknown>;
  return [
    sop.title,
    sop.summary,
    sop.purpose,
    sop.category,
    sop.owner,
    sop.ownerDepartment,
    ...(Array.isArray(sop.tags) ? sop.tags : []),
    ...(Array.isArray(sop.tools) ? sop.tools : []),
    version.summary,
    version.content,
  ]
    .join(" ")
    .toLowerCase();
}

function rankSops(sops: Array<Record<string, unknown>>, criteria: FinderCriteria, message: string) {
  const tokens = Array.from(
    new Set([
      ...tokenize(message),
      ...textList(criteria.keywords).flatMap(tokenize),
      ...tokenize([criteria.taskIntent, criteria.systemTool, criteria.category, criteria.department].join(" ")),
    ]),
  ).slice(0, 18);
  const category = String(criteria.category || "").toLowerCase();
  const tool = String(criteria.systemTool || "").toLowerCase();
  const intent = String(criteria.taskIntent || "").toLowerCase();

  return sops
    .map((sop) => {
      const title = String(sop.title || "").toLowerCase();
      const sopCategory = String(sop.category || "").toLowerCase();
      const haystack = searchableText(sop);
      let score = 0;

      tokens.forEach((token) => {
        if (title.includes(token)) score += 5;
        else if (sopCategory.includes(token)) score += 4;
        else if (haystack.includes(token)) score += 1;
      });

      if (category && (sopCategory.includes(category) || category.includes(sopCategory))) score += 8;
      if (tool && haystack.includes(tool)) score += 6;
      if (intent && title.includes(intent)) score += 8;
      score += Math.min(Number(sop.viewCount || 0) / 100, 2);

      return { sop, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || String(a.sop.title || "").localeCompare(String(b.sop.title || "")))
    .slice(0, 5);
}

function summarizeSop(sop: Record<string, unknown>, score: number) {
  return {
    id: sop.id,
    title: sop.title,
    summary: sop.summary || sop.purpose,
    category: sop.category,
    owner: sop.owner,
    status: sop.status,
    tools: sop.tools || [],
    tags: sop.tags || [],
    updatedAt: sop.updatedAt,
    url: sopUrl(sop),
    matchScore: Math.round(score),
  };
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const [payload, parseError] = await readBody<FinderRequestBody>(context.request);
  if (parseError) return parseError;

  const message = String(payload?.message || "").trim().slice(0, 1200);
  if (!message) return failure("FINDER_INPUT_REQUIRED", "Describe the task or SOP you need help finding.", 400);

  try {
    const criteria = await classifyWithAi(context.env, message, payload?.history || []);
    if (criteria.needsFollowUp) {
      return success({
        mode: "follow_up",
        question: criteria.followUpQuestion || "Which system, tool, or process is this about?",
        criteria,
        sops: [],
        sourcePolicy: "Only published SOP records are searched for Normal Users.",
        model: context.env.AI ? MODEL : "deterministic-fallback",
      });
    }

    const sops = await fetchPublishedSops(context.env.DB!);
    const ranked = rankSops(sops as Array<Record<string, unknown>>, criteria, message);
    const exactEnough = ranked.some((match) => match.score >= 8);

    return success({
      mode: ranked.length ? "results" : "no_results",
      criteria,
      sops: ranked.map((match) => summarizeSop(match.sop, match.score)),
      explanation: ranked.length
        ? exactEnough
          ? "These SOPs matched the extracted task, system/tool, category, or keywords."
          : "No exact match was found, so these are the closest related published SOPs."
        : "No published SOP records matched the extracted criteria. Try adding the system, tool, or task name.",
      sourcePolicy: "Only real published SOP records from the Cloudflare database are returned.",
      model: context.env.AI ? MODEL : "deterministic-fallback",
    });
  } catch (error) {
    return failure(
      "FINDER_FAILED",
      error instanceof Error ? error.message : "The Guided Finder could not process that request.",
      500,
    );
  }
};

export const onRequestGet = () =>
  success({
    service: "AI Guided SOP Finder",
    model: MODEL,
    sourcePolicy: "AI extracts search criteria; final results are published SOP records from D1.",
  });
