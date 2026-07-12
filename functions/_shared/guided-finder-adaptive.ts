import { getAuthUser, hasPermission, type AuthUser } from "./auth";
import { type D1DatabaseBinding, newId, safeJsonParse, type PagesFunctionContext } from "./cloudflare";
import { resolveRequestedCreatorSubRole } from "./ownership";
import { listSops } from "./sop-data";

export type GuidedFinderDimension =
  | "department"
  | "intent"
  | "systemOrTool"
  | "process"
  | "taskType"
  | "topic"
  | "problemType"
  | "approvalType";

export interface GuidedFinderAnswerMap {
  [key: string]: string;
}

export interface GuidedFinderQuestion {
  dimension: GuidedFinderDimension;
  label: string;
  help: string;
  options: Array<{
    value: string;
    label: string;
    candidateCount: number;
  }>;
}

export interface GuidedFinderResult {
  id: string;
  title: unknown;
  summary: unknown;
  category: unknown;
  department: string;
  systemOrTool: string[];
  updatedAt: string;
  href: string;
  confidence: number;
  matchedReasons: string[];
}

interface IndexedSop {
  sop: Record<string, unknown>;
  dimensions: Record<GuidedFinderDimension, string[]>;
  searchText: string;
}

export interface GuidedFinderState {
  sessionId: string;
  step: number;
  maxSteps: number;
  candidateCount: number;
  selectedAnswers: GuidedFinderAnswerMap;
  question: GuidedFinderQuestion | null;
  results: GuidedFinderResult[];
  resultState: {
    state: "narrowing" | "multiple_candidates" | "zero_candidates" | "low_confidence" | "strong_results";
    message: string;
  };
  nextAction: "answer" | "show_results" | "recover";
}

const MAX_STEPS = 5;
const STRONG_CONFIDENCE = 78;

const questionBank: Record<GuidedFinderDimension, { label: string; help: string }> = {
  department: {
    label: "Which department or team is this related to?",
    help: "Choose the department most connected to the SOP you need.",
  },
  intent: {
    label: "What are you trying to do?",
    help: "Choose the kind of work involved.",
  },
  systemOrTool: {
    label: "Which system or tool are you using?",
    help: "Choose a platform, application, or tool found in the remaining SOPs.",
  },
  process: {
    label: "Which process are you working on?",
    help: "Choose the process area that best matches your need.",
  },
  taskType: {
    label: "What task are you trying to complete?",
    help: "Choose the task type that best matches your work.",
  },
  topic: {
    label: "Which topic best matches your need?",
    help: "Choose a topic from the remaining published SOPs.",
  },
  problemType: {
    label: "What kind of problem are you experiencing?",
    help: "Choose a problem type only when troubleshooting SOPs remain.",
  },
  approvalType: {
    label: "What are you reviewing or approving?",
    help: "Choose the review or approval area that applies.",
  },
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function splitValues(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,|;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeComparable(value: string) {
  return value.trim().toLowerCase();
}

function slugLabel(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function text(value: unknown) {
  return String(value || "");
}

function sopHref(sop: Record<string, unknown>) {
  if (sop.slug) return `/sops/detail/?slug=${encodeURIComponent(String(sop.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(sop.id || ""))}`;
}

function metadata(sop: Record<string, unknown>) {
  const version = (sop.version || {}) as Record<string, unknown>;
  return {
    ...(sop.metadata as Record<string, unknown> | undefined),
    ...(version.metadata as Record<string, unknown> | undefined),
  };
}

function inferIntent(sop: Record<string, unknown>, haystack: string) {
  const type = text(sop.type).toLowerCase();
  if (type.includes("troubleshooting") || /\b(error|issue|missing|fix|troubleshoot|problem|resolve)\b/.test(haystack)) {
    return "Troubleshoot a problem";
  }
  if (/\b(review|approve|qa|quality assurance|checklist)\b/.test(haystack)) return "Review or approve work";
  if (/\b(system|tool|platform|brightspace|d2l|ivanti|cengage|ai)\b/.test(haystack)) return "Use a system or tool";
  if (/\b(template|job aid|how to|perform|learn)\b/.test(haystack)) return "Learn how to perform a task";
  return "Complete a process";
}

function lowValueOption(value: string) {
  return /^(archive|uncategorized|other|miscellaneous)$/i.test(value) || /\barchive\b/i.test(value);
}

function indexedSop(sop: Record<string, unknown>): IndexedSop {
  const meta = metadata(sop);
  const body = [
    sop.title,
    sop.summary,
    sop.purpose,
    sop.category,
    sop.ownerDepartment,
    sop.ownerTeam,
    ...(Array.isArray(sop.tags) ? sop.tags : []),
    ...(Array.isArray(sop.tools) ? sop.tools : []),
    (sop.version as Record<string, unknown> | undefined)?.content,
  ]
    .join(" ")
    .toLowerCase();
  const department = unique([text(sop.ownerDepartment), text(sop.ownerTeam), ...splitValues(meta.department)]);
  const systemOrTool = unique([...splitValues(sop.tools), ...splitValues(meta.tools), ...splitValues(meta.systems), ...splitValues(meta.systemOrTool)]);
  const topic = unique([...splitValues(sop.tags), ...splitValues(meta.topics), text(sop.category)].filter((item) => !lowValueOption(item)));
  const process = unique([...splitValues(meta.processes), text(sop.category), text(sop.type)].filter((item) => !lowValueOption(item)));
  const problemType = /\b(error|issue|missing|fail|troubleshoot|problem|resolve|access)\b/.test(body)
    ? unique([...splitValues(meta.problemTypes), "Troubleshooting"])
    : [];
  const approvalType = /\b(review|approve|approval|qa|quality assurance|checklist)\b/.test(body)
    ? unique([...splitValues(meta.approvalTypes), text(sop.category)].filter((item) => !lowValueOption(item)))
    : [];

  return {
    sop,
    searchText: body,
    dimensions: {
      department,
      intent: [inferIntent(sop, body)],
      systemOrTool,
      process,
      taskType: unique([text(sop.type), ...splitValues(meta.taskTypes)].filter(Boolean)),
      topic,
      problemType,
      approvalType,
    },
  };
}

function matchesAnswers(candidate: IndexedSop, answers: GuidedFinderAnswerMap) {
  return Object.entries(answers).every(([dimension, value]) => {
    if (!value || value === "__other") return true;
    const values = candidate.dimensions[dimension as GuidedFinderDimension] || [];
    const normalized = normalizeComparable(value);
    return values.some((item) => normalizeComparable(item) === normalized);
  });
}

function optionCounts(candidates: IndexedSop[], dimension: GuidedFinderDimension) {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    for (const value of candidate.dimensions[dimension] || []) {
      const label = value.trim();
      if (!label || lowValueOption(label)) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, candidateCount]) => ({ value, label: slugLabel(value), candidateCount }))
    .sort((a, b) => b.candidateCount - a.candidateCount || a.label.localeCompare(b.label))
    .slice(0, 10);
}

function splitQuality(options: Array<{ candidateCount: number }>, total: number) {
  if (options.length < 2 || total < 2) return 0;
  const ideal = total / options.length;
  const variance = options.reduce((sum, option) => sum + Math.abs(option.candidateCount - ideal), 0);
  return total - variance;
}

function nextQuestion(candidates: IndexedSop[], answers: GuidedFinderAnswerMap, step: number): GuidedFinderQuestion | null {
  if (step > MAX_STEPS || candidates.length <= 1) return null;
  const used = new Set(Object.keys(answers));
  const choices = (Object.keys(questionBank) as GuidedFinderDimension[])
    .filter((dimension) => !used.has(dimension))
    .map((dimension) => {
      const options = optionCounts(candidates, dimension);
      return { dimension, options, score: splitQuality(options, candidates.length) };
    })
    .filter((item) => item.options.length > 1)
    .sort((a, b) => b.score - a.score || b.options.length - a.options.length);

  const best = choices[0];
  if (!best) return null;
  const definition = questionBank[best.dimension];
  return {
    dimension: best.dimension,
    label: definition.label,
    help: definition.help,
    options: best.options.concat(best.options.length > 2 ? [{ value: "__other", label: "Other / Not sure", candidateCount: candidates.length }] : []),
  };
}

function scoreCandidate(candidate: IndexedSop, answers: GuidedFinderAnswerMap) {
  let answerMatches = 0;
  const reasons: string[] = [];
  for (const [dimension, value] of Object.entries(answers)) {
    if (!value || value === "__other") continue;
    const values = candidate.dimensions[dimension as GuidedFinderDimension] || [];
    if (values.some((item) => normalizeComparable(item) === normalizeComparable(value))) {
      answerMatches += 1;
      reasons.push(`${questionBank[dimension as GuidedFinderDimension]?.label || dimension}: ${slugLabel(value)}`);
    }
  }
  const freshness = candidate.sop.updatedAt ? Math.max(0, 8 - Math.floor((Date.now() - Date.parse(String(candidate.sop.updatedAt))) / 86400000 / 90)) : 0;
  const titleMatch = Object.values(answers).some((value) => value && candidate.searchText.includes(normalizeComparable(value))) ? 8 : 0;
  const confidence = Math.min(99, Math.round(answerMatches * 22 + titleMatch + freshness + Number(candidate.sop.viewCount || 0) / 25));
  return { confidence, reasons: reasons.length ? reasons : ["Matches the remaining published SOP candidate set."] };
}

function rankedResults(candidates: IndexedSop[], answers: GuidedFinderAnswerMap) {
  return candidates
    .map((candidate) => {
      const score = scoreCandidate(candidate, answers);
      return {
        candidate,
        confidence: score.confidence,
        reasons: score.reasons,
      };
    })
    .sort((a, b) => b.confidence - a.confidence || text(a.candidate.sop.title).localeCompare(text(b.candidate.sop.title)))
    .slice(0, 5)
    .map(({ candidate, confidence, reasons }) => ({
      id: String(candidate.sop.id || ""),
      title: candidate.sop.title,
      summary: candidate.sop.summary || candidate.sop.purpose,
      category: candidate.sop.category || "Uncategorized",
      department: text(candidate.sop.ownerTeam || candidate.sop.ownerDepartment || "All departments"),
      systemOrTool: candidate.dimensions.systemOrTool,
      updatedAt: text(candidate.sop.updatedAt || candidate.sop.publishedAt || ""),
      href: sopHref(candidate.sop),
      confidence,
      matchedReasons: reasons,
    }));
}

function resultState(candidateCount: number, results: GuidedFinderResult[], hasQuestion: boolean) {
  if (candidateCount === 0) {
    return {
      state: "zero_candidates" as const,
      message: "No SOPs match all of your current selections.",
    };
  }
  if (hasQuestion) {
    return {
      state: candidateCount > 1 ? "multiple_candidates" as const : "narrowing" as const,
      message: candidateCount > 1
        ? "We found several possible SOPs. Continue to narrow the results."
        : "Answer a few questions to narrow the available SOPs.",
    };
  }
  const top = results[0]?.confidence || 0;
  return {
    state: top >= STRONG_CONFIDENCE ? "strong_results" as const : "low_confidence" as const,
    message: top >= STRONG_CONFIDENCE
      ? "Best matching SOPs are ready."
      : "We found possible matches, but none appears exact.",
  };
}

export async function authorizedPublishedSops(context: PagesFunctionContext) {
  const user = await getAuthUser(context);
  const selectedSubRole = await resolveRequestedCreatorSubRole(context.env.DB!, context.request);
  const sops = await listSops(context.env.DB!, {
    publicOnly: true,
    sort: "recent",
    limit: 100,
    ownerSubRoleId: selectedSubRole?.id,
  });
  return {
    user,
    selectedSubRole,
    sops: sops.map((sop) => indexedSop(sop as Record<string, unknown>)),
  };
}

export function resolveGuidedFinderState(sessionId: string, allCandidates: IndexedSop[], answers: GuidedFinderAnswerMap, step: number): GuidedFinderState {
  const candidates = allCandidates.filter((candidate) => matchesAnswers(candidate, answers));
  const question = nextQuestion(candidates, answers, step);
  const results = question && candidates.length > 1 ? [] : rankedResults(candidates, answers);
  const state = resultState(candidates.length, results, Boolean(question));
  return {
    sessionId,
    step,
    maxSteps: MAX_STEPS,
    candidateCount: candidates.length,
    selectedAnswers: answers,
    question,
    results,
    resultState: state,
    nextAction: candidates.length === 0 ? "recover" : question ? "answer" : "show_results",
  };
}

export async function createGuidedFinderSession(db: D1DatabaseBinding, user: AuthUser | null, subRoleId: string | undefined, candidateIds: string[]) {
  const sessionId = newId("gf");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO guided_finder_sessions (
        id, user_id, role, sub_role_id, selected_answers_json, candidate_ids_json, current_step, max_steps, status, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sessionId,
      user?.id || null,
      user?.role || "guest",
      subRoleId || null,
      "{}",
      JSON.stringify(candidateIds),
      1,
      MAX_STEPS,
      "active",
      now,
      now,
      new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString(),
    )
    .run();
  return sessionId;
}

export async function ensureGuidedFinderTables(db: D1DatabaseBinding) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS guided_finder_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT,
      sub_role_id TEXT,
      selected_answers_json TEXT NOT NULL DEFAULT '{}',
      candidate_ids_json TEXT NOT NULL DEFAULT '[]',
      current_step INTEGER NOT NULL DEFAULT 1,
      max_steps INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS guided_finder_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      dimension TEXT NOT NULL,
      value TEXT NOT NULL,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}

export async function readGuidedFinderSession(db: D1DatabaseBinding, sessionId: string) {
  return await db
    .prepare(
      `SELECT id, user_id AS userId, role, sub_role_id AS subRoleId, selected_answers_json AS selectedAnswersJson,
        candidate_ids_json AS candidateIdsJson, current_step AS currentStep, max_steps AS maxSteps, status
       FROM guided_finder_sessions
       WHERE id = ? AND status != 'expired'
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<Record<string, unknown>>();
}

export async function updateGuidedFinderSession(
  db: D1DatabaseBinding,
  sessionId: string,
  answers: GuidedFinderAnswerMap,
  step: number,
  candidateCount: number,
  status: "active" | "completed" | "no_results",
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE guided_finder_sessions
       SET selected_answers_json = ?, current_step = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(JSON.stringify(answers), step, status, now, sessionId)
    .run();

  const entries = Object.entries(answers);
  const latest = entries.length ? entries[entries.length - 1] : null;
  if (latest) {
    await db
      .prepare(
        `INSERT INTO guided_finder_events (id, session_id, step, dimension, value, candidate_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(newId("gfe"), sessionId, step, latest[0], latest[1], candidateCount, now)
      .run();
  }
}

export function parseSessionAnswers(row: Record<string, unknown> | null) {
  return safeJsonParse<GuidedFinderAnswerMap>(String(row?.selectedAnswersJson || "{}"), {});
}

export function canUseGuidedFinder(user: AuthUser | null) {
  return !user || hasPermission(user, "Use Guided Finder");
}
