import { cacheHeaders, failure, optionalText, readBody, success, unixNow } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { getAuthUser, hasPermission, type AuthUser } from "../_shared/auth";
import { newId, type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveAuthorizedCreatorSubRole, type CreatorSubRole } from "../_shared/ownership";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_SOURCE_CHARS = 7000;
const MAX_PROMPT_CHARS = 4000;

interface AiAssistPayload {
  action?: string;
  sourceId?: string;
  prompt?: string;
  notes?: string;
}

interface WorkersAiTextResponse {
  response?: string;
  result?: {
    response?: string;
  };
}

const actionLabels: Record<string, string> = {
  ask: "Ask a question",
  "draft-sop": "Draft SOP",
  "improve-draft": "Improve draft",
  "summarize-sop": "Summarize SOP",
  "review-gaps": "Review for gaps",
  "review-comments": "Create review comments",
  "suggest-taxonomy": "Suggest tags/category",
};

function extractAiText(value: unknown) {
  if (typeof value === "string") return value;
  const response = value as WorkersAiTextResponse;
  return response.response || response.result?.response || "";
}

function sourceUrl(row: Record<string, unknown>) {
  if (row.slug) return `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(row.id || ""))}`;
}

function normalizeSource(row: Record<string, unknown>, includeContent = false) {
  const source = {
    id: row.id,
    title: row.title || "Untitled SOP",
    summary: row.summary || row.purpose || "",
    category: row.category || "Uncategorized",
    owner: row.owner || row.ownerSubRole || "Unassigned",
    ownerSubRoleId: row.ownerSubRoleId || "",
    ownerSubRole: row.ownerSubRole || "",
    ownerDepartment: row.ownerDepartment || "",
    status: row.status || "Draft",
    sourceType: row.sourceType || "Database SOP",
    tools: String(row.metadataJson || "").includes("tools") ? [] : [],
    url: sourceUrl(row),
    updatedAt: row.updatedAt || "",
  } as Record<string, unknown>;
  if (includeContent) {
    source.content = [
      row.title,
      row.summary,
      row.purpose,
      row.content,
      row.beforeYouBegin,
      row.checklist,
      row.troubleshooting,
      row.metadataJson,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_SOURCE_CHARS);
  }
  return source;
}

async function fallbackSubRole(db: D1DatabaseBinding) {
  return await db
    .prepare(
      `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`,
    )
    .first<CreatorSubRole>();
}

async function resolveAssistContext(db: D1DatabaseBinding, context: PagesFunctionContext) {
  const user = await getAuthUser(context);
  const requested = await resolveAuthorizedCreatorSubRole(db, user, context.request, { allowAdminFallback: true });
  const subRole = requested || user?.selectedSubRole || (user?.role === "admin" ? await fallbackSubRole(db) : null);

  if (user?.role === "creator" && requested && !user.subRoles.some((item) => item.id === requested.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user,
      subRole: null,
    };
  }

  return { response: null, user, subRole };
}

function allowedStatusClause(user: AuthUser | null, subRole: CreatorSubRole | null) {
  const canUseInternal =
    Boolean(user && user.role !== "normal" && subRole) &&
    (hasPermission(user!, "Edit Drafts") || hasPermission(user!, "Review SOPs") || hasPermission(user!, "Approve SOPs"));

  if (!canUseInternal) {
    return {
      sql: "sops.status IN ('Published', 'Approved')",
      values: [] as unknown[],
      sourcePolicy: "Only approved or published SOP records are available.",
    };
  }

  const scopeClauses = ["sops.owner_sub_role_id = ?"];
  const values: unknown[] = [subRole!.id];
  if (subRole!.teamId) {
    scopeClauses.push("sops.owner_team_id = ?");
    values.push(subRole!.teamId);
    scopeClauses.push(
      `EXISTS (
        SELECT 1 FROM sop_assignments
        WHERE sop_assignments.sop_id = sops.id
          AND sop_assignments.status = 'Active'
          AND sop_assignments.team_id = ?
      )`,
    );
    values.push(subRole!.teamId);
  }
  values.push(user!.id);
  scopeClauses.push(
    `EXISTS (
      SELECT 1 FROM sop_assignments
      WHERE sop_assignments.sop_id = sops.id
        AND sop_assignments.status = 'Active'
        AND sop_assignments.user_id = ?
    )`,
  );

  return {
    sql: `(sops.status IN ('Published', 'Approved') OR (sops.status IN ('Draft', 'In Review', 'Needs Revision', 'Approved') AND (${scopeClauses.join(" OR ")})))`,
    values,
    sourcePolicy: "Published/approved SOPs plus internal SOPs owned by or assigned to the selected Creator / Reviewer department are available.",
  };
}

async function queryAllowedSources(
  db: D1DatabaseBinding,
  user: AuthUser | null,
  subRole: CreatorSubRole | null,
  sourceId = "",
  includeContent = false,
) {
  const access = allowedStatusClause(user, subRole);
  const idClause = sourceId ? "AND sops.id = ?" : "";
  const values = sourceId ? [...access.values, sourceId] : access.values;
  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        COALESCE(sops.summary, sops.purpose) AS summary,
        sops.purpose,
        sops.status,
        sops.source_type AS sourceType,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        sops.owner_sub_role_id AS ownerSubRoleId,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        COALESCE(versions.content, versions.body_markdown) AS content,
        versions.before_you_begin AS beforeYouBegin,
        versions.checklist,
        versions.troubleshooting,
        versions.metadata_json AS metadataJson
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
       WHERE COALESCE(sops.is_active, 1) = 1
        AND ${access.sql}
        ${idClause}
       GROUP BY sops.id
       ORDER BY CASE sops.status WHEN 'Published' THEN 1 WHEN 'Approved' THEN 2 ELSE 3 END, sops.updated_at DESC, sops.title ASC
       LIMIT ${sourceId ? "1" : "250"}`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return {
    sources: (result.results || []).map((row) => normalizeSource(row, includeContent)),
    sourcePolicy: access.sourcePolicy,
  };
}

function buildSystemPrompt() {
  return `You are AI Assist for an SOP Knowledge Hub.
Use only the provided backend source content and the user's notes.
Do not invent SOP titles, policies, owners, links, dates, categories, approvals, or workflow facts.
If the provided source and notes are insufficient, say what is missing and ask one follow-up question.
Keep output practical, structured, and ready for a creator/reviewer to use.
Do not reveal any content outside the provided source.`;
}

function buildUserPrompt(action: string, source: Record<string, unknown> | null, prompt: string, user: AuthUser | null, subRole: CreatorSubRole | null) {
  return `Requested action: ${actionLabels[action] || action}
User role: ${user?.role || "normal"}
Access level: ${user?.accessLevel || "Normal User"}
Selected department/sub-role: ${subRole?.label || "none"}

Allowed backend source:
${source ? `ID: ${source.id}
Title: ${source.title}
Status: ${source.status}
Category: ${source.category}
Owner: ${source.owner}
Content:
${source.content || source.summary || ""}` : "No source selected or no authorized source available."}

User notes/question:
${prompt || "(none)"}

Return:
1. AI answer
2. Source used
3. Limitation note
4. Suggested next action if applicable`;
}

function fallbackAnswer(source: Record<string, unknown> | null, prompt: string) {
  if (!source && !prompt) {
    return "I do not have enough approved source information or user notes to help yet. Which SOP, request, or draft should I use?";
  }
  const title = source?.title ? ` using ${source.title}` : "";
  return `AI service is unavailable, so here is a grounded fallback${title}: review the selected source and notes, keep only verified steps, identify missing owner/review details, and route the item through the normal SOP workflow before publishing.`;
}

async function logAssist(
  db: D1DatabaseBinding,
  user: AuthUser | null,
  action: string,
  sourceId: string,
  status: string,
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("audit"),
      user?.id || null,
      "ai_assist",
      "sop",
      sourceId || "none",
      JSON.stringify({ action, sourceStatus: status, promptStored: false }),
      new Date(unixNow() * 1000).toISOString(),
    )
    .run()
    .catch(() => undefined);
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const resolved = await resolveAssistContext(context.env.DB!, context);
  if (resolved.response) return resolved.response;

  const { sources, sourcePolicy } = await queryAllowedSources(context.env.DB!, resolved.user, resolved.subRole);
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        currentUser: resolved.user
          ? {
              id: resolved.user.id,
              name: resolved.user.name,
              email: resolved.user.email,
              role: resolved.user.role,
              accessLevel: resolved.user.accessLevel,
              permissions: resolved.user.permissions,
              selectedSubRole: resolved.subRole,
            }
          : null,
        roleOptions: [
          {
            id: resolved.user?.role || "normal",
            label: resolved.user?.accessLevel || "Normal User",
            selected: true,
          },
        ],
        actions: Object.entries(actionLabels).map(([id, label]) => ({ id, label })),
        sources,
        sourcePolicy,
        model: MODEL,
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
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const resolved = await resolveAssistContext(context.env.DB!, context);
  if (resolved.response) return resolved.response;

  const [payload, parseError] = await readBody<AiAssistPayload>(context.request);
  if (parseError) return parseError;

  const action = optionalText(payload?.action || "ask", 80);
  const prompt = optionalText(payload?.prompt || payload?.notes, MAX_PROMPT_CHARS);
  const sourceId = optionalText(payload?.sourceId, 180);
  if (!actionLabels[action]) return failure("VALIDATION_ERROR", "Choose a valid AI Assist action.", 400, { action: "Invalid action" });
  if (!sourceId && !prompt) return failure("VALIDATION_ERROR", "Choose a source or enter notes before using AI Assist.", 400, { prompt: "Required" });

  const { sources, sourcePolicy } = await queryAllowedSources(context.env.DB!, resolved.user, resolved.subRole, sourceId, true);
  const source = sources[0] || null;
  if (sourceId && !source) {
    return failure("SOURCE_NOT_ALLOWED", "That SOP source is not available for the selected role, sub-role, or permissions.", 403);
  }

  let answer = "";
  let model = MODEL;
  let limitation = source
    ? "Response is grounded in the selected backend SOP source and the provided notes."
    : "No authorized source was selected; response is limited to user-provided notes.";

  if (context.env.AI) {
    try {
      const aiResult = await context.env.AI.run(MODEL, {
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(action, source, prompt, resolved.user, resolved.subRole) },
        ],
        max_tokens: 900,
        temperature: 0.2,
      });
      answer = extractAiText(aiResult).trim();
    } catch {
      model = "deterministic-fallback";
      answer = fallbackAnswer(source, prompt);
      limitation = "Workers AI could not complete the request, so a deterministic grounded fallback was returned.";
    }
  } else {
    model = "deterministic-fallback";
    answer = fallbackAnswer(source, prompt);
    limitation = "Workers AI binding is unavailable, so a deterministic grounded fallback was returned.";
  }

  await logAssist(context.env.DB!, resolved.user, action, String(source?.id || sourceId || ""), String(source?.status || ""));

  return success({
    answer: answer || fallbackAnswer(source, prompt),
    source: source
      ? {
          id: source.id,
          title: source.title,
          status: source.status,
          sourceType: source.sourceType,
          url: source.url,
        }
      : null,
    action,
    model,
    sourcePolicy,
    limitation,
    suggestedNextAction:
      action === "draft-sop"
        ? "Review the draft, then save it through Create SOP."
        : action === "review-comments"
          ? "Add the comments to the relevant review item if they are accurate."
          : "Verify the output against the source before changing an SOP.",
  });
};
