import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputDir = path.join(root, ".helpdocs-import");

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
  args.set(key, valueParts.length ? valueParts.join("=") : "true");
}

const outputDir = path.resolve(root, args.get("output-dir") || defaultOutputDir);
const jsonOutputPath = path.resolve(outputDir, args.get("json") || "helpdocs-import.json");
const sqlOutputPath = path.resolve(outputDir, args.get("sql") || "helpdocs-import.sql");
const sourceJsonPath = args.has("source-json") ? path.resolve(root, args.get("source-json")) : "";
const categoriesJsonPath = args.has("categories-json") ? path.resolve(root, args.get("categories-json")) : "";
const limit = args.has("limit") ? Number(args.get("limit")) : undefined;
const applyTarget = args.get("apply");

const creatorSubRoles = [
  {
    id: "subrole-instructional-technology-specialist",
    label: "Instructional Technologist",
    slug: "instructional-technologist",
    department: "Instructional Technology",
    teamId: "team-instructional-technology-specialists",
    teamName: "Instructional Technologists",
    authorNames: ["Kevan Van Cleave"],
    sortOrder: 10,
  },
  {
    id: "subrole-instructional-designer",
    label: "Instructional Designer",
    slug: "instructional-designer",
    department: "Instructional Design",
    teamId: "team-instructional-designers",
    teamName: "Instructional Designers",
    authorNames: ["Craig Cuatt", "Criag Cuatt"],
    sortOrder: 20,
  },
  {
    id: "subrole-project-manager",
    label: "Project Manager",
    slug: "project-manager",
    department: "Project Management",
    teamId: "team-project-managers",
    teamName: "Project Managers",
    authorNames: ["Craig Cuatt", "Criag Cuatt"],
    sortOrder: 30,
  },
  {
    id: "subrole-quality-assurance-specialist",
    label: "Quality Assurance Specialist",
    slug: "quality-assurance-specialist",
    department: "Quality Assurance",
    teamId: "team-quality-assurance-specialists",
    teamName: "Quality Assurance Specialists",
    authorNames: ["Amy Lakin"],
    sortOrder: 40,
  },
  {
    id: "subrole-multimedia",
    label: "Multimedia",
    slug: "multimedia",
    department: "Multimedia",
    teamId: "team-multimedia",
    teamName: "Multimedia",
    authorNames: ["John Winchester"],
    sortOrder: 50,
  },
];

const creatorSubRoleByAuthor = new Map(
  creatorSubRoles.flatMap((subRole) =>
    subRole.authorNames.map((authorName) => [authorName.toLowerCase(), subRole]),
  ),
);

const projectManagerSignals = [
  "pm",
  "project",
  "project manager",
  "project management",
  "scoping",
  "scope",
  "charter",
  "stakeholder",
  "timeline",
  "milestone",
  "workforce transformation",
  "anthology",
  "registration",
  "license",
  "identogo",
  "adobe sign",
];

const instructionalTechnologySignals = [
  "instructional technology",
  "instructional technologist",
  "its",
  "ivanti",
  "ticketing",
  "ticket routing",
  "course support",
  "student support",
  "brightspace",
  "d2l",
  "cengage",
  "lms",
  "nasium",
  "password",
  "grade report",
  "access issue",
  "enrollment issue",
];

const qualityAssuranceSignals = [
  "qa",
  "quality assurance",
  "clw",
  "test",
  "quiz",
  "question",
  "respondus",
  "assessment",
];

const multimediaSignals = [
  "multimedia",
  "media",
  "video",
  "audio",
  "caption",
  "transcript",
];

const instructionalDesignerSignals = [
  "instructional design",
  "course build",
  "course design",
  "course content",
  "template",
  "objectives",
  "lesson",
  "ai tools",
];

const instructionalTechnologySubRoleId = "subrole-instructional-technology-specialist";
const instructionalDesignerSubRoleId = "subrole-instructional-designer";
const projectManagerSubRoleId = "subrole-project-manager";
const qualityAssuranceSubRoleId = "subrole-quality-assurance-specialist";
const multimediaSubRoleId = "subrole-multimedia";

function readEnvFile() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function requiredApiKey() {
  readEnvFile();
  if (!process.env.HELPDOCS_API_KEY) {
    throw new Error("HELPDOCS_API_KEY is not set. Run .\\scripts\\configure-helpdocs.ps1 or add it to .env.local.");
  }
  return process.env.HELPDOCS_API_KEY;
}

async function helpdocsGet(pathname, searchParams = {}) {
  const url = new URL(`https://api.helpdocs.io/v1/${pathname}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${requiredApiKey()}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HelpDocs ${pathname} request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function slugify(value, fallback = "item") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || fallback;
}

function stableId(prefix, value) {
  return `${prefix}-${slugify(value, "unknown")}`;
}

function isoDate(value, fallback = new Date().toISOString()) {
  const date = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function dateOnly(value) {
  return isoDate(value).slice(0, 10);
}

function addMonths(value, months) {
  const date = new Date(isoDate(value));
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function summaryText(value, fallback) {
  const text = stripHtml(value);
  if (!text) return fallback;
  return text.length > 900 ? `${text.slice(0, 897).trim()}...` : text;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (typeof tag === "string") return tag;
      return tag?.name || tag?.title || tag?.slug || "";
    })
    .map((tag) => String(tag).trim())
    .filter(Boolean);
}

function hasAnySignal(value, signals) {
  return signals.some((signal) => {
    const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(value);
  });
}

function inferCreatorSubRole(article, tagNames = [], category = null) {
  const authorName = String(article.author?.name || "").trim();
  const normalizedAuthor = authorName.toLowerCase();
  const categoryText = [category?.name, category?.slug, category?.description].filter(Boolean).join(" ").toLowerCase();
  const metadataText = [
    article.title,
    article.slug,
    article.description,
    article.short_version,
    article.relative_url,
    article.url,
    categoryText,
    ...tagNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (hasAnySignal(metadataText, qualityAssuranceSignals)) {
    return creatorSubRoles.find((subRole) => subRole.id === qualityAssuranceSubRoleId) || null;
  }

  if (hasAnySignal(metadataText, instructionalTechnologySignals)) {
    return creatorSubRoles.find((subRole) => subRole.id === instructionalTechnologySubRoleId) || null;
  }

  if (hasAnySignal(metadataText, multimediaSignals)) {
    return creatorSubRoles.find((subRole) => subRole.id === multimediaSubRoleId) || null;
  }

  if (hasAnySignal(metadataText, projectManagerSignals)) {
    return creatorSubRoles.find((subRole) => subRole.id === projectManagerSubRoleId) || null;
  }

  if (hasAnySignal(metadataText, instructionalDesignerSignals)) {
    return creatorSubRoles.find((subRole) => subRole.id === instructionalDesignerSubRoleId) || null;
  }

  if (normalizedAuthor === "craig cuatt" || normalizedAuthor === "criag cuatt") {
    const haystack = [
      article.title,
      article.slug,
      article.description,
      article.short_version,
      ...tagNames,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (projectManagerSignals.some((signal) => haystack.includes(signal))) {
      return creatorSubRoles.find((subRole) => subRole.id === projectManagerSubRoleId) || null;
    }
    return creatorSubRoles.find((subRole) => subRole.id === instructionalDesignerSubRoleId) || null;
  }

  return creatorSubRoleByAuthor.get(normalizedAuthor) || creatorSubRoles.find((subRole) => subRole.id === instructionalDesignerSubRoleId) || null;
}

function inferSopType(article) {
  const haystack = `${article.title || ""} ${article.slug || ""}`.toLowerCase();
  if (haystack.includes("template")) return "Template";
  if (haystack.includes("checklist") || haystack.includes("qa")) return "Checklist";
  if (haystack.includes("troubleshoot") || haystack.includes("issue")) return "Troubleshooting Guide";
  if (haystack.includes("job aid") || haystack.includes("guide")) return "Job Aid";
  return "Process";
}

function articleStatus(article) {
  return article.is_published ? "Published" : "Draft";
}

function articleVisibility(article) {
  return article.is_private || article.permission_groups ? "Restricted" : "Public";
}

function categoryColor(index) {
  const palette = ["#e0f2fe", "#fef3c7", "#ede9fe", "#dcfce7", "#fee2e2", "#fce7f3", "#f0fdf4"];
  return palette[index % palette.length];
}

function mapCategory(category, index) {
  const title = category.title || category.name || "Uncategorized";
  const slug = slugify(category.slug || title, "uncategorized");
  const now = new Date().toISOString();
  return {
    id: stableId("category", slug),
    externalId: category.category_id || "",
    name: title,
    slug,
    description: category.description || "",
    icon: category.icon || title.slice(0, 2).toUpperCase(),
    color: category.color || categoryColor(index),
    sortOrder: Number(category.sort_order || category.order || index + 1) * 10,
    status: "Active",
    createdAt: isoDate(category.created_at, now),
    updatedAt: isoDate(category.updated_at, now),
  };
}

function mapUser(author, now) {
  if (!author?.email && !author?.name) return null;
  const email = String(author.email || `${slugify(author.name)}@helpdocs.local`).toLowerCase();
  const subRole = creatorSubRoleByAuthor.get(String(author.name || "").toLowerCase()) || null;
  return {
    id: stableId("helpdocs-user", email),
    name: author.name || email,
    email,
    department: subRole?.department || "Imported from HelpDocs",
    title: subRole?.label || "HelpDocs Author",
    teamIds: subRole ? [subRole.teamId] : [],
    subRoleIds: creatorSubRoles
      .filter((candidate) =>
        candidate.authorNames.some((authorName) => authorName.toLowerCase() === String(author.name || "").toLowerCase()),
      )
      .map((candidate) => candidate.id),
    roleIds: ["role-creator-reviewer"],
    accessLevel: "Creator / Reviewer",
    permissions: ["Create SOPs", "Edit Drafts", "Review SOPs", "Request Changes", "Approve SOPs", "Publish SOPs", "Archive SOPs"],
    status: "Active",
    createdAt: now,
    updatedAt: now,
    profileImage: author.profile_image || "",
  };
}

function mapArticle(article, categoryByExternalId, tagByName, userByEmail) {
  const now = new Date().toISOString();
  const createdAt = isoDate(article.created_at, now);
  const updatedAt = isoDate(article.updated_at || article.created_at, now);
  const articleId = article.article_id || article.id || slugify(article.title);
  const sopId = stableId("helpdocs-sop", articleId);
  const versionNumber = String(article.version_number || "1");
  const versionId = stableId("helpdocs-version", `${articleId}-v${versionNumber}`);
  const title = article.title || "Untitled HelpDocs Article";
  const purpose = summaryText(article.description || article.short_version || article.body, title);
  const status = articleStatus(article);
  const category = categoryByExternalId.get(article.category_id || "") || null;
  const tagNames = normalizeTags(article.tags);
  const tagIds = tagNames.map((tag) => tagByName.get(tag.toLowerCase())?.id).filter(Boolean);
  const authorEmail = String(article.author?.email || "").toLowerCase();
  const owner = userByEmail.get(authorEmail) || null;
  const ownerSubRole = inferCreatorSubRole(article, tagNames, category);
  const publishedAt = status === "Published" ? updatedAt : undefined;
  const bodyHtml = article.body || `<p>${purpose || title}</p>`;
  const plainText = stripHtml(bodyHtml);
  const metadata = {
    importedFrom: "HelpDocs",
    helpdocs: {
      articleId,
      accountId: article.account_id || "",
      userId: article.user_id || "",
      categoryId: article.category_id || "",
      url: article.url || "",
      relativeUrl: article.relative_url || "",
      editorType: article.editor_type || "",
      showToc: Boolean(article.show_toc),
      isPrivate: Boolean(article.is_private),
      isPublished: Boolean(article.is_published),
      isFeatured: Boolean(article.is_featured),
      isCurrentVersion: Boolean(article.is_current_version),
      permissionGroups: article.permission_groups || null,
      staleStatus: article.stale_status || null,
      descriptionWasAutogenerated: Boolean(article.description_was_autogenerated),
      shortVersionWasAutogenerated: Boolean(article.short_version_was_autogenerated),
    },
    author: article.author || null,
    ownerSubRole: ownerSubRole
      ? {
          id: ownerSubRole.id,
          label: ownerSubRole.label,
          department: ownerSubRole.department,
          teamId: ownerSubRole.teamId,
        }
      : null,
    audience: ["Internal SOP users"],
    tools: [],
    sourceUrl: article.url || "",
  };

  const sop = {
    id: sopId,
    slug: `helpdocs-${article.slug || slugify(title, sopId)}-${slugify(articleId)}`,
    title,
    purpose,
    categoryId: category?.id || null,
    category: category?.name || "Uncategorized",
    ownerUserId: owner?.id,
    ownerTeamId: ownerSubRole?.teamId,
    ownerSubRoleId: ownerSubRole?.id,
    owner: owner?.name || article.author?.name || "HelpDocs Import",
    status,
    type: inferSopType(article),
    currentVersionId: versionId,
    version: versionNumber,
    tools: [],
    audience: metadata.audience,
    tagIds,
    tags: tagNames,
    estimatedCompletionTime: "",
    lastUpdated: dateOnly(updatedAt),
    reviewDate: addMonths(updatedAt, 12),
    publishedAt,
    archivedAt: undefined,
    createdAt,
    updatedAt,
    visibility: articleVisibility(article),
    sourceType: "Imported",
    sourceUrl: article.url || "",
    summary: purpose,
    metadata,
  };

  const sopVersion = {
    id: versionId,
    sopId,
    version: versionNumber,
    title,
    purpose,
    beforeYouBegin: "",
    procedureSteps: [],
    screenshots: [],
    checklist: [],
    troubleshootingNotes: "",
    relatedSopIds: [],
    changeSummary: `Imported from HelpDocs article ${articleId}.`,
    authorUserId: owner?.id,
    reviewerUserId: undefined,
    approvedByUserId: undefined,
    approvedAt: publishedAt,
    status,
    createdAt,
    updatedAt,
    content: bodyHtml,
    plainText,
    metadata,
  };

  return { sop, sopVersion };
}

function sqlString(value) {
  if (value === undefined || value === null || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "NULL";
}

function jsonSql(value) {
  return sqlString(JSON.stringify(value ?? {}));
}

function epoch(value) {
  if (!value) return null;
  const time = new Date(isoDate(value)).getTime();
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
}

function buildSearchDocuments(sops, versions) {
  const versionBySop = new Map(versions.map((version) => [version.sopId, version]));
  return sops.map((sop) => {
    const version = versionBySop.get(sop.id);
    const tagsText = (sop.tags || []).join(" ");
    const toolsText = (sop.tools || []).join(" ");
    const audienceText = (sop.audience || []).join(" ");
    const bodyText = version?.plainText || stripHtml(version?.content || "");
    const searchText = [sop.title, sop.purpose, sop.category, sop.owner, tagsText, toolsText, audienceText, bodyText]
      .filter(Boolean)
      .join(" ");
    return {
      sopId: sop.id,
      title: sop.title,
      category: sop.category,
      owner: sop.owner,
      status: sop.status,
      tagsText,
      toolsText,
      audienceText,
      bodyText,
      searchText,
      lastIndexedAt: new Date().toISOString(),
    };
  });
}

function buildImportSql(importData) {
  const statements = [
    "-- Generated by scripts/import-helpdocs.mjs",
    "-- Review before applying to Cloudflare D1.",
    "PRAGMA foreign_keys = ON;",
  ];

  for (const subRole of importData.creatorSubRoles) {
    statements.push(`INSERT OR IGNORE INTO teams (id, name, description, created_at, updated_at)
VALUES (
  ${sqlString(subRole.teamId)}, ${sqlString(subRole.teamName)},
  ${sqlString(`Owns SOPs for the ${subRole.label} creator/reviewer sub-role.`)},
  ${sqlString(importData.importedAt)}, ${sqlString(importData.importedAt)}
);`);

    statements.push(`INSERT INTO creator_sub_roles (
  id, label, slug, department, team_id, description, sort_order, status, created_at, updated_at
) VALUES (
  ${sqlString(subRole.id)}, ${sqlString(subRole.label)}, ${sqlString(subRole.slug)}, ${sqlString(subRole.department)},
  ${sqlString(subRole.teamId)}, ${sqlString(`Creator / Reviewer sub-role for ${subRole.department} SOP ownership.`)},
  ${sqlNumber(subRole.sortOrder)}, 'Active', ${sqlString(importData.importedAt)}, ${sqlString(importData.importedAt)}
) ON CONFLICT(id) DO UPDATE SET
  label = excluded.label,
  department = excluded.department,
  team_id = excluded.team_id,
  description = excluded.description,
  sort_order = excluded.sort_order,
  status = 'Active',
  updated_at = excluded.updated_at;`);
  }

  for (const category of importData.categories) {
    statements.push(`INSERT INTO categories (
  id, name, slug, description, icon, color, sort_order, is_active, created_at, updated_at
) VALUES (
  ${sqlString(category.id)}, ${sqlString(category.name)}, ${sqlString(category.slug)}, ${sqlString(category.description)},
  ${sqlString(category.icon)}, ${sqlString(category.color)}, ${sqlNumber(category.sortOrder)}, 1,
  ${sqlString(category.createdAt)}, ${sqlString(category.updatedAt)}
) ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  icon = excluded.icon,
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_active = 1,
  updated_at = excluded.updated_at;`);
  }

  for (const user of importData.users) {
    statements.push(`INSERT INTO users (
  id, name, email, department, title, access_level, status, role, is_active, created_at, updated_at
) VALUES (
  ${sqlString(user.id)}, ${sqlString(user.name)}, ${sqlString(user.email)}, ${sqlString(user.department)},
  ${sqlString(user.title)}, ${sqlString(user.accessLevel)}, ${sqlString(user.status)}, ${sqlString(user.accessLevel)},
  1, ${sqlString(user.createdAt)}, ${sqlString(user.updatedAt)}
) ON CONFLICT(email) DO UPDATE SET
  name = excluded.name,
  department = excluded.department,
  title = excluded.title,
  access_level = excluded.access_level,
  status = excluded.status,
  role = excluded.role,
  is_active = 1,
  updated_at = excluded.updated_at;`);

    for (const subRoleId of user.subRoleIds || []) {
      statements.push(`INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id)
VALUES (${sqlString(user.id)}, ${sqlString(subRoleId)});`);
    }
  }

  for (const tag of importData.tags) {
    statements.push(`INSERT INTO tags (
  id, name, slug, status, notes, is_active, created_at, updated_at
) VALUES (
  ${sqlString(tag.id)}, ${sqlString(tag.name)}, ${sqlString(tag.slug)}, 'Active',
  ${sqlString(tag.notes || "Imported from HelpDocs article tags.")}, 1,
  ${sqlString(tag.createdAt)}, ${sqlString(tag.updatedAt)}
) ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  status = 'Active',
  notes = COALESCE(tags.notes, excluded.notes),
  is_active = 1,
  updated_at = excluded.updated_at;`);
  }

  for (const sop of importData.sops) {
    statements.push(`INSERT INTO sops (
  id, title, slug, summary, purpose, category_id, owner_id, owner_user_id, owner_team_id, owner_sub_role_id, status, type,
  current_version_id, estimated_completion_time, estimated_minutes, audience, review_date,
  review_due_at, visibility, source_type, is_active, created_by_user_id, published_at,
  created_at, updated_at
) VALUES (
  ${sqlString(sop.id)}, ${sqlString(sop.title)}, ${sqlString(sop.slug)}, ${sqlString(sop.summary)}, ${sqlString(sop.purpose)},
  ${sqlString(sop.categoryId)}, ${sqlString(sop.ownerUserId)}, ${sqlString(sop.ownerUserId)}, ${sqlString(sop.ownerTeamId)},
  ${sqlString(sop.ownerSubRoleId)}, ${sqlString(sop.status)}, ${sqlString(sop.type)}, ${sqlString(sop.currentVersionId)}, ${sqlString(sop.estimatedCompletionTime)}, NULL,
  ${sqlString((sop.audience || []).join("|"))}, ${sqlString(sop.reviewDate)}, ${sqlNumber(epoch(sop.reviewDate))},
  ${sqlString(sop.visibility)}, ${sqlString(sop.sourceType)}, 1, ${sqlString(sop.ownerUserId)},
  ${sqlString(sop.publishedAt)}, ${sqlString(sop.createdAt)}, ${sqlString(sop.updatedAt)}
) ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  slug = excluded.slug,
  summary = excluded.summary,
  purpose = excluded.purpose,
  category_id = excluded.category_id,
  owner_id = excluded.owner_id,
  owner_user_id = excluded.owner_user_id,
  owner_team_id = excluded.owner_team_id,
  owner_sub_role_id = excluded.owner_sub_role_id,
  status = excluded.status,
  type = excluded.type,
  current_version_id = excluded.current_version_id,
  audience = excluded.audience,
  review_date = excluded.review_date,
  review_due_at = excluded.review_due_at,
  visibility = excluded.visibility,
  source_type = excluded.source_type,
  is_active = excluded.is_active,
  published_at = excluded.published_at,
  updated_at = excluded.updated_at;`);
  }

  for (const version of importData.sopVersions) {
    statements.push(`INSERT INTO sop_versions (
  id, sop_id, version_label, version_number, title, summary, purpose, body_markdown,
  content, before_you_begin, checklist, troubleshooting, metadata_json, change_summary,
  status, created_by_user_id, created_by, approved_by_user_id, created_at, updated_at, approved_at, published_at
) VALUES (
  ${sqlString(version.id)}, ${sqlString(version.sopId)}, ${sqlString(version.version)}, ${sqlString(version.version)},
  ${sqlString(version.title)}, ${sqlString(version.purpose)}, ${sqlString(version.purpose)},
  ${sqlString(version.content)}, ${sqlString(version.content)}, ${sqlString(version.beforeYouBegin)},
  ${sqlString((version.checklist || []).join("\\n"))}, ${sqlString(version.troubleshootingNotes)},
  ${jsonSql(version.metadata)}, ${sqlString(version.changeSummary)}, ${sqlString(version.status)},
  ${sqlString(version.authorUserId)}, ${sqlString(version.authorUserId)}, ${sqlString(version.approvedByUserId)},
  ${sqlString(version.createdAt)}, ${sqlNumber(epoch(version.updatedAt))}, ${sqlString(version.approvedAt)},
  ${sqlNumber(version.approvedAt ? epoch(version.approvedAt) : null)}
) ON CONFLICT(id) DO UPDATE SET
  version_label = excluded.version_label,
  version_number = excluded.version_number,
  title = excluded.title,
  summary = excluded.summary,
  purpose = excluded.purpose,
  body_markdown = excluded.body_markdown,
  content = excluded.content,
  metadata_json = excluded.metadata_json,
  change_summary = excluded.change_summary,
  status = excluded.status,
  created_by_user_id = excluded.created_by_user_id,
  created_by = excluded.created_by,
  approved_at = excluded.approved_at,
  updated_at = excluded.updated_at,
  published_at = excluded.published_at;`);
  }

  for (const relationship of importData.sopTags) {
    statements.push(`INSERT OR IGNORE INTO sop_tags (sop_id, tag_id)
VALUES (${sqlString(relationship.sopId)}, ${sqlString(relationship.tagId)});`);
  }

  for (const searchDoc of importData.searchDocuments) {
    statements.push(`INSERT INTO sop_search_documents (
  sop_id, title, category, owner, status, tags_text, tools_text, audience_text, body_text, search_text, last_indexed_at
) VALUES (
  ${sqlString(searchDoc.sopId)}, ${sqlString(searchDoc.title)}, ${sqlString(searchDoc.category)},
  ${sqlString(searchDoc.owner)}, ${sqlString(searchDoc.status)}, ${sqlString(searchDoc.tagsText)},
  ${sqlString(searchDoc.toolsText)}, ${sqlString(searchDoc.audienceText)}, ${sqlString(searchDoc.bodyText)},
  ${sqlString(searchDoc.searchText)}, ${sqlString(searchDoc.lastIndexedAt)}
) ON CONFLICT(sop_id) DO UPDATE SET
  title = excluded.title,
  category = excluded.category,
  owner = excluded.owner,
  status = excluded.status,
  tags_text = excluded.tags_text,
  tools_text = excluded.tools_text,
  audience_text = excluded.audience_text,
  body_text = excluded.body_text,
  search_text = excluded.search_text,
  last_indexed_at = excluded.last_indexed_at;`);
  }

  statements.push(`INSERT INTO audit_logs (id, action, entity_type, entity_id, after_json, details, created_at)
VALUES (
  ${sqlString(stableId("audit", `helpdocs-import-${Date.now()}`))},
  'helpdocs_import_preview',
  'SOP',
  'helpdocs',
  ${jsonSql(importData.summary)},
  ${sqlString(`Prepared HelpDocs import for ${importData.summary.sops} SOPs.`)},
  ${sqlString(new Date().toISOString())}
);`);

  return `${statements.join("\n\n")}\n`;
}

async function loadSourceData() {
  if (sourceJsonPath) {
    const articlesPayload = JSON.parse(readFileSync(sourceJsonPath, "utf8"));
    const categoriesPayload = categoriesJsonPath ? JSON.parse(readFileSync(categoriesJsonPath, "utf8")) : { categories: [] };
    return {
      articles: Array.isArray(articlesPayload.articles) ? articlesPayload.articles : [],
      categories: Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : [],
    };
  }

  const [articlesPayload, categoriesPayload] = await Promise.all([
    helpdocsGet("article", { include_body: true, limit }),
    helpdocsGet("category"),
  ]);

  return {
    articles: Array.isArray(articlesPayload.articles) ? articlesPayload.articles : [],
    categories: Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : [],
  };
}

function buildImportData(source) {
  const now = new Date().toISOString();
  const categories = source.categories.map(mapCategory);
  const categoryByExternalId = new Map(categories.map((category) => [category.externalId, category]));
  const uncategorized = {
    id: "helpdocs-category-uncategorized",
    externalId: "",
    name: "Uncategorized",
    slug: "uncategorized",
    description: "Imported HelpDocs articles without a category.",
    icon: "UC",
    color: "#f8fafc",
    sortOrder: 9990,
    status: "Active",
    createdAt: now,
    updatedAt: now,
  };

  if (source.articles.some((article) => !article.category_id)) {
    categories.push(uncategorized);
    categoryByExternalId.set("", uncategorized);
  }

  const usersByEmail = new Map();
  for (const article of source.articles) {
    const user = mapUser(article.author, now);
    if (user) usersByEmail.set(user.email, user);
  }

  const tagNames = new Set(source.articles.flatMap((article) => normalizeTags(article.tags)));
  const tags = [...tagNames].sort((a, b) => a.localeCompare(b)).map((name) => ({
    id: stableId("tag", name),
    name,
    slug: slugify(name),
    description: "Imported from HelpDocs article tags.",
    usageCount: source.articles.filter((article) => normalizeTags(article.tags).includes(name)).length,
    status: "Active",
    notes: "Imported from HelpDocs article tags.",
    createdAt: now,
    updatedAt: now,
  }));
  const tagByName = new Map(tags.map((tag) => [tag.name.toLowerCase(), tag]));

  const mappedArticles = source.articles.map((article) => mapArticle(article, categoryByExternalId, tagByName, usersByEmail));
  const sops = mappedArticles.map((item) => item.sop);
  const sopVersions = mappedArticles.map((item) => item.sopVersion);
  const sopTags = sops.flatMap((sop) => sop.tagIds.map((tagId) => ({ sopId: sop.id, tagId })));
  const searchDocuments = buildSearchDocuments(sops, sopVersions);

  return {
    importedAt: now,
    source: {
      name: "HelpDocs",
      articleCount: source.articles.length,
      categoryCount: source.categories.length,
    },
    summary: {
      categories: categories.length,
      users: usersByEmail.size,
      tags: tags.length,
      sops: sops.length,
      sopVersions: sopVersions.length,
      publishedSops: sops.filter((sop) => sop.status === "Published").length,
      draftSops: sops.filter((sop) => sop.status === "Draft").length,
      restrictedSops: sops.filter((sop) => sop.visibility === "Restricted").length,
      taggedSops: sops.filter((sop) => sop.tags.length > 0).length,
      categorizedSops: sops.filter((sop) => sop.categoryId && sop.category !== "Uncategorized").length,
    },
    categories,
    users: [...usersByEmail.values()],
    creatorSubRoles,
    tags,
    sops,
    sopVersions,
    sopTags,
    searchDocuments,
  };
}

function applySql(target) {
  if (!["local", "remote"].includes(target)) {
    throw new Error("--apply must be local or remote.");
  }

  const relativeSqlOutputPath = path.relative(root, sqlOutputPath);
  const command = [
    "wrangler",
    "d1",
    "execute",
    "sop-knowledge-hub-db",
    target === "remote" ? "--remote" : "--local",
    "--file",
    relativeSqlOutputPath,
  ];
  if (process.platform === "win32") {
    const quote = (value) => {
      const text = String(value);
      return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    };
    execFileSync("cmd.exe", ["/d", "/s", "/c", ["npx", ...command.map(quote)].join(" ")], {
      cwd: root,
      stdio: "inherit",
    });
    return;
  }

  execFileSync("npx", command, {
    cwd: root,
    stdio: "inherit",
  });
}

const source = await loadSourceData();
const importData = buildImportData(source);
const sql = buildImportSql(importData);

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonOutputPath, `${JSON.stringify(importData, null, 2)}\n`);
writeFileSync(sqlOutputPath, sql);

console.log(`HelpDocs import mapped ${importData.summary.sops} SOPs.`);
console.log(`JSON: ${path.relative(root, jsonOutputPath)}`);
console.log(`SQL:  ${path.relative(root, sqlOutputPath)}`);
console.log(JSON.stringify(importData.summary, null, 2));

if (applyTarget) {
  applySql(applyTarget);
}
