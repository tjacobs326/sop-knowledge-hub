import { cacheHeaders, failure, readBody, success } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { getAuthUser } from "../../_shared/auth";
import { type PagesFunctionContext } from "../../_shared/cloudflare";
import { listActiveDepartments, type DepartmentRow } from "../../_shared/departments";
import { resolveRequestedCreatorSubRole } from "../../_shared/ownership";
import { listSopFacets, listSops } from "../../_shared/sop-data";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const LOW_CONFIDENCE = 35;
const CATEGORY_OPTION_LIMIT = 8;
const GUIDED_FINDER_EXCLUDED_DEPARTMENTS = new Set([
  "instructional technologists",
  "quality assurance specialists",
]);

interface GuidedFinderFilters {
  department?: string;
  category?: string;
  tool?: string;
  task?: string;
  userRole?: string;
}

interface GuidedFinderRequest {
  mode?: "options" | "search";
  description?: string;
  filters?: GuidedFinderFilters;
}

interface GuidedFinderIntent {
  department?: string;
  system?: string;
  tool?: string;
  category?: string;
  task?: string;
  processType?: string;
  keywords?: string[];
  confidence?: number;
  missingFields?: string[];
  suggestedNextQuestion?: string;
}

interface GuidedFinderOption {
  value: string;
  label: string;
  hint?: string;
}

interface GuidedFinderStep {
  key: keyof GuidedFinderFilters;
  number: number;
  shortLabel: string;
  question: string;
  help: string;
  options: GuidedFinderOption[];
  preselected?: string;
  locked?: boolean;
}

interface RankedCandidate {
  id: string;
  relevance: string;
  rank?: number;
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

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function textList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function tokenize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function extractAiText(value: unknown) {
  if (typeof value === "string") return value;
  const response = value as WorkersAiTextResponse;
  const text = response.response || response.result?.response || "";
  return typeof text === "string" ? text : JSON.stringify(text);
}

function parseJsonObject<T extends object>(value: string): Partial<T> {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as Partial<T>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as Partial<T>;
    } catch {
      return {};
    }
  }
}

function sopUrl(sop: Record<string, unknown>) {
  if (sop.slug) return `/sops/detail/?slug=${encodeURIComponent(String(sop.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(sop.id || ""))}`;
}

function normalizeDate(value: unknown) {
  return value ? String(value) : "";
}

function matchesText(value: unknown, expected: string) {
  if (!expected) return true;
  const source = String(value || "").toLowerCase();
  const target = expected.toLowerCase();
  return source === target || source.includes(target) || target.includes(source);
}

function includesAny(values: unknown, expected: string) {
  if (!expected) return true;
  const target = expected.toLowerCase();
  const list = Array.isArray(values) ? values.map(String) : String(values || "").split(/[,|]/);
  return list.some((item) => {
    const source = item.trim().toLowerCase();
    return source === target || source.includes(target) || target.includes(source);
  });
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
    sop.ownerTeam,
    ...(Array.isArray(sop.tags) ? sop.tags : []),
    ...(Array.isArray(sop.tools) ? sop.tools : []),
    version.summary,
    version.content,
  ]
    .join(" ")
    .toLowerCase();
}

function departmentName(value: string | undefined, departments: DepartmentRow[]) {
  if (!value) return "";
  const match = departments.find(
    (department) => department.id === value || department.name.toLowerCase() === value.toLowerCase(),
  );
  return match?.name || value;
}

function optionFromValue(value: string, hint = ""): GuidedFinderOption {
  return {
    value,
    label: value,
    hint,
  };
}

const guidedNeedOptions: GuidedFinderOption[] = [
  { value: "Use a system or tool", label: "Use a system or tool" },
  { value: "Complete a process", label: "Complete a process" },
  { value: "Learn how to perform a task", label: "Learn how to perform a task" },
  { value: "Review or approve work", label: "Review or approve work" },
  { value: "Troubleshoot a problem", label: "Troubleshoot a problem" },
];

function buildNeedOptions() {
  return guidedNeedOptions;
}

function categorySignalScore(name: string, count: number) {
  const normalized = name.toLowerCase();
  let score = count * 20;
  if (/(brightspace|cengage|course build|quality|qa|template|troubleshoot|ticket|ivanti|accessibility|multimedia|project|planning|ai)/i.test(name)) {
    score += 14;
  }
  if (/^(archive|uncategorized)$/i.test(name) || /\barchive\b/i.test(name)) score -= 40;
  if (/\b(other|miscellaneous|general)\b/i.test(name)) score -= count > 2 ? 8 : 22;
  if (/^\d+\.\s*/.test(name)) score -= 6;
  if (normalized.length > 42) score -= 4;
  return score;
}

function isLowSignalCategory(name: string) {
  return /^(archive|uncategorized)$/i.test(name) || /\b(archive|uncategorized|other|miscellaneous)\b/i.test(name);
}

function buildCategoryOptions(sops: Array<Record<string, unknown>>, fallbackCategories: string[]) {
  const counts = new Map<string, number>();
  for (const sop of sops) {
    const category = String(sop.category || "").trim();
    if (!category) continue;
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  const ranked = Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      count,
      score: categorySignalScore(category, count),
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.category.localeCompare(b.category));

  const selected = (ranked.length ? ranked : fallbackCategories.map((category) => ({ category, count: 0, score: categorySignalScore(category, 0) })))
    .filter((item) => item.category && !isLowSignalCategory(item.category) && item.score > 0)
    .slice(0, CATEGORY_OPTION_LIMIT);

  return selected.map((item) => ({
    value: item.category,
    label: item.category,
    hint: item.count ? `${item.count} published SOP${item.count === 1 ? "" : "s"}` : "Published SOP category",
  }));
}

function buildGuidedSteps(input: {
  departments: DepartmentRow[];
  facets: Awaited<ReturnType<typeof listSopFacets>>;
  sops: Array<Record<string, unknown>>;
  user: Awaited<ReturnType<typeof getAuthUser>>;
  selectedSubRole: Awaited<ReturnType<typeof resolveRequestedCreatorSubRole>>;
}) {
  const knownDepartment = input.user?.selectedSubRole?.department || input.selectedSubRole?.department || "";
  const departmentOptions = input.departments
    .filter((department) => !GUIDED_FINDER_EXCLUDED_DEPARTMENTS.has(department.name.trim().toLowerCase()))
    .map((department) => ({
      value: department.name,
      label: department.name,
      hint: department.description || "Active backend department",
    }));
  const roleOptions = unique(input.sops.flatMap((sop) => (Array.isArray(sop.audience) ? sop.audience.map(String) : []))).map((role) =>
    optionFromValue(role, "Audience from published SOP metadata"),
  );
  const categoryOptions = buildCategoryOptions(input.sops, input.facets.categories);
  const toolOptions = input.facets.tools.map((tool) => optionFromValue(tool, "System or tool from SOP metadata"));
  const steps: GuidedFinderStep[] = [
    {
      key: "department",
      number: 1,
      shortLabel: "Role",
      question: "Who are you?",
      help: knownDepartment
        ? "Your department context is preselected from your active role. Change it only if your access allows broader searching."
        : "Choose the department or team most related to the SOP you need.",
      options: departmentOptions,
      preselected: knownDepartment,
      locked: Boolean(knownDepartment && input.user?.role === "creator"),
    },
    {
      key: "task",
      number: 2,
      shortLabel: "Need",
      question: "What do you need?",
      help: "Choose the kind of work you are trying to complete.",
      options: buildNeedOptions(),
    },
    {
      key: "tool",
      number: 3,
      shortLabel: "Tool",
      question: "Which system or tool are you using?",
      help: "Pick the platform, system, or tool involved. This question is skipped when it would not narrow results.",
      options: toolOptions,
    },
    {
      key: "category",
      number: 4,
      shortLabel: "Category",
      question: "Which category best matches the work?",
      help: "Categories come from the live Cloudflare database.",
      options: categoryOptions,
    },
    {
      key: "userRole",
      number: 5,
      shortLabel: "Audience",
      question: "Who is this SOP for?",
      help: "Use this when the SOP depends on a specific audience or role.",
      options: roleOptions,
    },
  ];

  return steps.filter((step) => step.options.length > 0);
}

async function logGuidedFinderNoResult(db: NonNullable<PagesFunctionContext["env"]["DB"]>, query: string, filters: GuidedFinderFilters) {
  try {
    await db
      .prepare(
        `INSERT INTO search_logs (id, query, filters_json, results_count, no_results, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(`search-${Date.now()}-${Math.random().toString(36).slice(2)}`, query.slice(0, 500), JSON.stringify(filters), 0, 1, new Date().toISOString())
      .run();
  } catch {
    // Analytics logging must never block the interactive finder.
  }
}


function deterministicIntent(description: string, filters: GuidedFinderFilters = {}): GuidedFinderIntent {
  const keywords = unique([
    ...tokenize(description),
    ...tokenize(filters.department),
    ...tokenize(filters.category),
    ...tokenize(filters.tool),
    ...tokenize(filters.task),
    ...tokenize(filters.userRole),
  ]).slice(0, 10);
  return {
    department: filters.department,
    category: filters.category,
    tool: filters.tool,
    system: filters.tool,
    task: filters.task || description,
    keywords,
    confidence: keywords.length >= 3 ? 55 : 25,
    missingFields: keywords.length >= 3 ? [] : ["task", "system/tool"],
    suggestedNextQuestion: keywords.length >= 3 ? "" : "Which system, tool, or process is this about?",
  };
}

function validateIntent(intent: Partial<GuidedFinderIntent>, description: string, filters: GuidedFinderFilters) {
  const fallback = deterministicIntent(description, filters);
  const keywords = unique([
    ...textList(intent.keywords),
    ...tokenize(intent.task),
    ...tokenize(intent.system),
    ...tokenize(intent.tool),
    ...tokenize(intent.category),
    ...tokenize(description),
  ]).slice(0, 10);
  const rawConfidence = Number(intent.confidence);
  const normalizedConfidence = rawConfidence > 0 && rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence;
  const confidence = Number.isFinite(normalizedConfidence)
    ? Math.max(0, Math.min(100, normalizedConfidence))
    : fallback.confidence;

  return {
    department: String(intent.department || filters.department || "").trim(),
    system: String(intent.system || filters.tool || "").trim(),
    tool: String(intent.tool || intent.system || filters.tool || "").trim(),
    category: String(intent.category || filters.category || "").trim(),
    task: String(intent.task || filters.task || description || "").trim(),
    processType: String(intent.processType || "").trim(),
    keywords: keywords.length ? keywords : fallback.keywords,
    confidence,
    missingFields: textList(intent.missingFields).slice(0, 4),
    suggestedNextQuestion: String(intent.suggestedNextQuestion || fallback.suggestedNextQuestion || "").trim(),
  } satisfies GuidedFinderIntent;
}

async function classifyIntent(env: PagesFunctionContext["env"], description: string, filters: GuidedFinderFilters) {
  if (!description.trim() || !env.AI) return deterministicIntent(description, filters);

  try {
    const aiResult = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You extract structured intent for an SOP Guided Finder. Return valid JSON only. Do not recommend SOP titles. Do not invent database records.",
        },
        {
          role: "user",
          content: `Return compact JSON with keys department, system, tool, category, task, processType, keywords, confidence, missingFields, suggestedNextQuestion.
Known selections:
${JSON.stringify(filters)}

User description:
${description.slice(0, 1200)}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });
    return validateIntent(parseJsonObject<GuidedFinderIntent>(extractAiText(aiResult)), description, filters);
  } catch {
    return deterministicIntent(description, filters);
  }
}

function scoreSop(sop: Record<string, unknown>, intent: GuidedFinderIntent, description: string, filters: GuidedFinderFilters) {
  const haystack = searchableText(sop);
  const title = String(sop.title || "").toLowerCase();
  const category = String(sop.category || "").toLowerCase();
  const tool = String(intent.tool || filters.tool || "").toLowerCase();
  const selectedCategory = String(intent.category || filters.category || "").toLowerCase();
  const tokens = unique([
    ...tokenize(description),
    ...tokenize(intent.task),
    ...tokenize(intent.system),
    ...tokenize(intent.tool),
    ...tokenize(intent.category),
    ...(intent.keywords || []),
  ]).slice(0, 18);
  let score = 0;

  tokens.forEach((token) => {
    if (title.includes(token)) score += 5;
    else if (category.includes(token)) score += 4;
    else if (haystack.includes(token)) score += 1;
  });

  if (selectedCategory && (category.includes(selectedCategory) || selectedCategory.includes(category))) score += 8;
  if (tool && haystack.includes(tool)) score += 6;
  if (filters.userRole && includesAny(sop.audience, filters.userRole)) score += 3;
  score += Math.min(Number(sop.viewCount || 0) / 100, 2);
  return score;
}

async function rankWithAi(env: PagesFunctionContext["env"], candidates: Array<Record<string, unknown>>, intent: GuidedFinderIntent, description: string) {
  if (!env.AI || candidates.length < 2) return [];
  const candidateSet = new Set(candidates.map((sop) => String(sop.id)));

  try {
    const aiResult = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Rank only the supplied SOP candidates. Return JSON only: {\"ranked\":[{\"id\":\"...\",\"relevance\":\"short reason\"}]}. Never add IDs that are not supplied.",
        },
        {
          role: "user",
          content: JSON.stringify({
            intent,
            description,
            candidates: candidates.slice(0, 12).map((sop) => ({
              id: sop.id,
              title: sop.title,
              summary: sop.summary || sop.purpose,
              department: sop.ownerTeam || sop.ownerDepartment,
              category: sop.category,
              tools: sop.tools || [],
              tags: sop.tags || [],
              updatedAt: sop.updatedAt,
            })),
          }),
        },
      ],
      max_tokens: 700,
      temperature: 0.1,
    });
    const parsed = parseJsonObject<{ ranked?: RankedCandidate[] }>(extractAiText(aiResult));
    const ranked = Array.isArray(parsed.ranked) ? parsed.ranked : [];
    return ranked
      .filter((item) => candidateSet.has(String(item.id)))
      .map((item) => ({
        id: String(item.id),
        relevance: String(item.relevance || "Matches your selected Guided Finder criteria.").slice(0, 220),
        rank: Number(item.rank || 0),
      }));
  } catch {
    return [];
  }
}

function summarizeSop(sop: Record<string, unknown>, relevance: string, matchScore: number) {
  return {
    id: sop.id,
    title: sop.title,
    summary: sop.summary || sop.purpose,
    department: sop.ownerTeam || sop.ownerDepartment || "All departments",
    category: sop.category || "Uncategorized",
    tools: Array.isArray(sop.tools) ? sop.tools : [],
    lastReviewed: normalizeDate(sop.reviewDate || sop.reviewDueAt),
    updatedAt: normalizeDate(sop.updatedAt || sop.publishedAt),
    status: sop.status || "Published",
    relevance,
    href: sopUrl(sop),
    matchScore: Math.round(matchScore),
  };
}

async function publishedSops(context: PagesFunctionContext, filters: GuidedFinderFilters, departments: DepartmentRow[]) {
  const selectedSubRole = await resolveRequestedCreatorSubRole(context.env.DB!, context.request);
  const department = departmentName(filters.department, departments);
  const category = filters.category || undefined;
  const tool = filters.tool || undefined;
  const initial = await listSops(context.env.DB!, {
    publicOnly: true,
    sort: "recent",
    limit: 100,
    category,
    tool,
    ownerSubRoleId: selectedSubRole?.id,
  });

  const filtered = initial.filter((sop) => {
    const departmentAllowed =
      !department || matchesText(sop.ownerDepartment, department) || matchesText(sop.ownerTeam, department);
    const roleAllowed = includesAny(sop.audience, filters.userRole || "");
    return departmentAllowed && roleAllowed;
  });

  return filtered.length ? filtered : initial.filter((sop) => includesAny(sop.audience, filters.userRole || ""));
}

async function guidedFinderOptionsResponse(context: PagesFunctionContext) {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  try {
    const selectedSubRole = await resolveRequestedCreatorSubRole(context.env.DB!, context.request);
    const [facets, departments, sops, user] = await Promise.all([
      listSopFacets(context.env.DB!, { ownerSubRoleId: selectedSubRole?.id }),
      listActiveDepartments(context.env.DB!),
      listSops(context.env.DB!, { publicOnly: true, sort: "recent", limit: 100, ownerSubRoleId: selectedSubRole?.id }),
      getAuthUser(context),
    ]);
    const roles = unique(sops.flatMap((sop) => (Array.isArray(sop.audience) ? sop.audience.map(String) : [])));
    const tasks = unique([
      ...facets.tags,
      ...sops.flatMap((sop) => [String(sop.type || ""), ...(Array.isArray(sop.tags) ? sop.tags.map(String) : [])]),
    ]).slice(0, 80);
    const steps = buildGuidedSteps({ departments, facets, sops, user, selectedSubRole });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: user
            ? {
                role: user.role,
                accessLevel: user.accessLevel,
                department: user.selectedSubRole?.department || selectedSubRole?.department || "",
                subRole: user.selectedSubRole
                  ? { id: user.selectedSubRole.id, label: user.selectedSubRole.label, department: user.selectedSubRole.department }
                  : selectedSubRole
                    ? { id: selectedSubRole.id, label: selectedSubRole.label, department: selectedSubRole.department }
                    : null,
                permissions: {
                  canCreateSop: user.role === "admin" || user.permissions.includes("Create SOPs"),
                },
              }
            : null,
          options: {
            departments: departments.map((department) => ({ id: department.id, name: department.name })),
            categories: facets.categories,
            tools: facets.tools,
            tasks,
            roles,
          },
          steps,
          sourcePolicy: "Guided Finder options are loaded from published SOP records and active backend departments.",
          model: context.env.AI ? MODEL : "deterministic-fallback",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...cacheHeaders("private"),
          vary: "x-sop-sub-role",
        },
      },
    );
  } catch (error) {
    return failure("GUIDED_FINDER_OPTIONS_FAILED", error instanceof Error ? error.message : "Unable to load Guided Finder options.", 500);
  }
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  return guidedFinderOptionsResponse(context);
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const [payload, parseError] = await readBody<GuidedFinderRequest>(context.request);
  if (parseError) return parseError;

  if (payload?.mode === "options") {
    return guidedFinderOptionsResponse(context);
  }

  const description = String(payload?.description || "").trim().slice(0, 1200);
  const filters = payload?.filters || {};

  try {
    const departments = await listActiveDepartments(context.env.DB!);
    const normalizedFilters = {
      ...filters,
      department: departmentName(filters.department, departments),
    };
    const intent = await classifyIntent(context.env, description, normalizedFilters);
    const candidates = await publishedSops(context, normalizedFilters, departments);
    const scored = candidates
      .map((sop) => ({
        sop,
        score: scoreSop(sop as Record<string, unknown>, intent, description, normalizedFilters),
      }))
      .filter((match) => match.score > 0 || Object.values(normalizedFilters).some(Boolean))
      .sort((a, b) => b.score - a.score || String(a.sop.title || "").localeCompare(String(b.sop.title || "")));

    const candidateRows = scored.length ? scored : candidates.map((sop) => ({ sop, score: 1 }));
    const aiRanking = await rankWithAi(
      context.env,
      candidateRows.map((match) => match.sop as Record<string, unknown>),
      intent,
      description,
    );
    const rankingById = new Map(aiRanking.map((item, index) => [item.id, { ...item, index }]));
    const finalRows = candidateRows
      .sort((a, b) => {
        const aiA = rankingById.get(String(a.sop.id));
        const aiB = rankingById.get(String(b.sop.id));
        if (aiA && aiB) return aiA.index - aiB.index;
        if (aiA) return -1;
        if (aiB) return 1;
        return b.score - a.score;
      });

    const results = finalRows.slice(0, 5).map((match) => {
      const ai = rankingById.get(String(match.sop.id));
      const relevance =
        ai?.relevance ||
        (match.score >= 8
          ? "Matches your selected task, system, category, or keywords."
          : "Closest published SOP match based on your Guided Finder answers.");
      return summarizeSop(match.sop as Record<string, unknown>, relevance, match.score);
    });

    const needsFollowUp =
      !results.length && Boolean((intent.confidence || 0) < LOW_CONFIDENCE || (intent.missingFields || []).length);

    if (!results.length) {
      await logGuidedFinderNoResult(context.env.DB!, description || Object.values(normalizedFilters).filter(Boolean).join(" "), normalizedFilters);
    }

    return success({
      mode: results.length ? "results" : needsFollowUp ? "follow_up" : "no_results",
      intent,
      results,
      total: finalRows.length,
      nextQuestion: needsFollowUp
        ? intent.suggestedNextQuestion || "Which system, tool, or process is this about?"
        : "",
      sourcePolicy: "Only active published SOP records authorized by the backend are returned.",
      model: context.env.AI ? MODEL : "deterministic-fallback",
    });
  } catch (error) {
    return failure("GUIDED_FINDER_SEARCH_FAILED", error instanceof Error ? error.message : "Unable to search Guided Finder results.", 500);
  }
};
