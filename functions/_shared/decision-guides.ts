import { safeJsonParse, type D1DatabaseBinding } from "./cloudflare";

export interface RoutingInput {
  role?: string;
  requestType?: string;
  details?: string;
  impact?: {
    studentBlocked?: boolean;
    gradesAffected?: boolean;
    manyStudents?: boolean;
    oneStudent?: boolean;
    liveCourse?: boolean;
  };
  signals?: Record<string, boolean | string | number | null | undefined>;
}

interface RuleRow {
  id: string;
  guideId: string;
  requestTypeId: string;
  requestKey: string;
  roleKey: string | null;
  routeLabel: string;
  routeClass: string;
  destinationLabel: string;
  destinationTeamId: string | null;
  actionType: string;
  requiresTicket: number;
  requiresProjectPath: number;
  priorityScore: number;
  urgencyScore: number;
  ownershipScore: number;
  confidenceBase: number;
  title: string;
  summary: string;
  nextStepsJson: string;
  externalUrl: string | null;
  sortOrder: number;
}

interface SignalRow {
  ruleId: string;
  signalKey: string;
  signalValue: string;
  weight: number;
  polarity: number;
}

const keywordSignals: Array<[string, RegExp]> = [
  ["student_blocked", /\b(blocked|cannot access|can't access|unable to access|student can't|student cannot)\b/i],
  ["grades_affected", /\b(grade|gradebook|score|sync|passed back|completion|assessment)\b/i],
  ["many_students", /\b(all students|many students|multiple students|whole course|everyone|classwide)\b/i],
  ["one_student", /\b(one student|single student|individual student|just one)\b/i],
  ["access_request", /\b(enroll|enrollment|access|add .* course|add .* shell|role)\b/i],
  ["add_person", /\b(add (a )?(student|instructor|pd|staff|user|person))\b/i],
  ["template_clone", /\b(template|clone|copy (a )?(course )?shell|clone (a )?(course )?shell)\b/i],
  ["new_build", /\b(new build|new-build|launch readiness|course offering)\b/i],
  ["kaltura", /\bkaltura\b/i],
  ["captivate", /\bcaptivate\b/i],
  ["h5p", /\bh5p\b/i],
  ["vendor_issue", /\b(vendor|cengage|provider|external tool)\b/i],
  ["broad_change", /\b(project|redesign|broad|large change|replace all|coursewide|course-wide)\b/i],
  ["many_items", /\b(many quiz|all quiz|many items|bulk|multiple items|all questions)\b/i],
  ["book_change", /\b(book edition|textbook|edition change|book change)\b/i],
  ["bounded_fix", /\b(fix|broken|link|error|issue|not working)\b/i],
];

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function boolSignal(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = String(value || "").toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}

export function deriveRoutingSignals(input: RoutingInput) {
  const details = String(input.details || "");
  const signals: Record<string, boolean> = {};

  for (const [key, pattern] of keywordSignals) {
    signals[key] = pattern.test(details);
  }

  const impact = input.impact || {};
  if (impact.studentBlocked !== undefined) signals.student_blocked = Boolean(impact.studentBlocked);
  if (impact.gradesAffected !== undefined) signals.grades_affected = Boolean(impact.gradesAffected);
  if (impact.manyStudents !== undefined) signals.many_students = Boolean(impact.manyStudents);
  if (impact.oneStudent !== undefined) signals.one_student = Boolean(impact.oneStudent);
  if (impact.liveCourse !== undefined) signals.live_course = Boolean(impact.liveCourse);

  Object.entries(input.signals || {}).forEach(([key, value]) => {
    signals[normalizeKey(key).replace(/-/g, "_")] = boolSignal(value);
  });

  return signals;
}

export async function getDecisionGuide(db: D1DatabaseBinding, slug: string) {
  const guide = await db
    .prepare("SELECT * FROM decision_guides WHERE slug = ? AND status = 'Published' LIMIT 1")
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!guide) return null;

  const guideId = String(guide.id);
  const [roles, requestTypes, roleAdjustments, scenarios, journey, faqs] = await Promise.all([
    db.prepare("SELECT role_key AS roleKey, label, icon, hint, sort_order AS sortOrder FROM decision_guide_roles WHERE guide_id = ? ORDER BY sort_order ASC").bind(guideId).all(),
    db.prepare("SELECT request_key AS requestKey, label, icon, hint, default_badge AS defaultBadge, default_title AS defaultTitle, default_summary AS defaultSummary, sort_order AS sortOrder FROM decision_request_types WHERE guide_id = ? AND status = 'Active' ORDER BY sort_order ASC").bind(guideId).all(),
    db.prepare("SELECT role_key AS roleKey, display_name AS displayName, note, sort_order AS sortOrder FROM decision_role_adjustments WHERE guide_id = ? ORDER BY sort_order ASC").bind(guideId).all(),
    db.prepare(`SELECT scenarios.id, request_types.request_key AS requestKey, scenarios.title, scenarios.route_label AS routeLabel, scenarios.route_class AS routeClass, scenarios.destination_label AS destinationLabel, scenarios.why, scenarios.next_step AS nextStep, scenarios.sort_order AS sortOrder
      FROM decision_scenarios scenarios
      JOIN decision_request_types request_types ON request_types.id = scenarios.request_type_id
      WHERE scenarios.guide_id = ?
      ORDER BY scenarios.sort_order ASC`).bind(guideId).all(),
    db.prepare("SELECT step_number AS stepNumber, title, body FROM decision_journey_steps WHERE guide_id = ? ORDER BY step_number ASC").bind(guideId).all(),
    db.prepare("SELECT question, answer, sort_order AS sortOrder FROM decision_faqs WHERE guide_id = ? ORDER BY sort_order ASC").bind(guideId).all(),
  ]);

  return {
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    summary: guide.summary,
    sourceUrl: guide.source_url,
    categoryId: guide.category_id,
    ownerTeamId: guide.owner_team_id,
    defaultSopId: guide.default_sop_id,
    roles: roles.results || [],
    requestTypes: requestTypes.results || [],
    roleAdjustments: roleAdjustments.results || [],
    scenarios: scenarios.results || [],
    journey: journey.results || [],
    faqs: faqs.results || [],
  };
}

async function getGuideId(db: D1DatabaseBinding, slug: string) {
  const row = await db
    .prepare("SELECT id FROM decision_guides WHERE slug = ? AND status = 'Published' LIMIT 1")
    .bind(slug)
    .first<{ id: string }>();
  return row?.id || "";
}

function scoreRule(rule: RuleRow, signals: Record<string, boolean>, signalRows: SignalRow[], roleKey: string) {
  const signalScore = signalRows
    .filter((signal) => signal.ruleId === rule.id)
    .reduce((total, signal) => {
      const active = signals[signal.signalKey] === boolSignal(signal.signalValue);
      return total + (active ? signal.weight * signal.polarity : 0);
    }, 0);
  const roleScore = rule.roleKey && rule.roleKey === roleKey ? 8 : rule.roleKey ? -20 : 0;
  const score = rule.confidenceBase + rule.priorityScore * 0.15 + rule.urgencyScore * 0.15 + rule.ownershipScore * 0.2 + signalScore + roleScore;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function routeDecisionGuide(db: D1DatabaseBinding, slug: string, input: RoutingInput) {
  const guideId = await getGuideId(db, slug);
  if (!guideId) return null;

  const requestKey = normalizeKey(input.requestType || "broken");
  const roleKey = normalizeKey(input.role || "learner-services");
  const signals = deriveRoutingSignals(input);

  const rulesResult = await db
    .prepare(
      `SELECT
        rules.id,
        rules.guide_id AS guideId,
        rules.request_type_id AS requestTypeId,
        request_types.request_key AS requestKey,
        rules.role_key AS roleKey,
        rules.route_label AS routeLabel,
        rules.route_class AS routeClass,
        rules.destination_label AS destinationLabel,
        rules.destination_team_id AS destinationTeamId,
        rules.action_type AS actionType,
        rules.requires_ticket AS requiresTicket,
        rules.requires_project_path AS requiresProjectPath,
        rules.priority_score AS priorityScore,
        rules.urgency_score AS urgencyScore,
        rules.ownership_score AS ownershipScore,
        rules.confidence_base AS confidenceBase,
        rules.title,
        rules.summary,
        rules.next_steps_json AS nextStepsJson,
        rules.external_url AS externalUrl,
        rules.sort_order AS sortOrder
       FROM decision_routing_rules rules
       JOIN decision_request_types request_types ON request_types.id = rules.request_type_id
       WHERE rules.guide_id = ?
         AND request_types.request_key = ?
         AND (rules.role_key IS NULL OR rules.role_key = ?)
       ORDER BY rules.sort_order ASC`,
    )
    .bind(guideId, requestKey, roleKey)
    .all<RuleRow>();

  let rules = rulesResult.results || [];
  if (!rules.length) {
    const fallback = await db
      .prepare(
        `SELECT
          rules.id,
          rules.guide_id AS guideId,
          rules.request_type_id AS requestTypeId,
          request_types.request_key AS requestKey,
          rules.role_key AS roleKey,
          rules.route_label AS routeLabel,
          rules.route_class AS routeClass,
          rules.destination_label AS destinationLabel,
          rules.destination_team_id AS destinationTeamId,
          rules.action_type AS actionType,
          rules.requires_ticket AS requiresTicket,
          rules.requires_project_path AS requiresProjectPath,
          rules.priority_score AS priorityScore,
          rules.urgency_score AS urgencyScore,
          rules.ownership_score AS ownershipScore,
          rules.confidence_base AS confidenceBase,
          rules.title,
          rules.summary,
          rules.next_steps_json AS nextStepsJson,
          rules.external_url AS externalUrl,
          rules.sort_order AS sortOrder
         FROM decision_routing_rules rules
         JOIN decision_request_types request_types ON request_types.id = rules.request_type_id
         WHERE rules.guide_id = ?
           AND request_types.request_key = 'broken'
         ORDER BY rules.sort_order ASC
         LIMIT 1`,
      )
      .bind(guideId)
      .all<RuleRow>();
    rules = fallback.results || [];
  }

  const ruleIds = rules.map((rule) => rule.id);
  const signalRows = ruleIds.length
    ? (
        await db
          .prepare(
            `SELECT rule_id AS ruleId, signal_key AS signalKey, signal_value AS signalValue, weight, polarity
             FROM decision_rule_signals
             WHERE rule_id IN (${ruleIds.map(() => "?").join(",")})`,
          )
          .bind(...ruleIds)
          .all<SignalRow>()
      ).results || []
    : [];

  const ranked = rules
    .map((rule) => ({
      rule,
      score: scoreRule(rule, signals, signalRows, roleKey),
    }))
    .sort((a, b) => b.score - a.score || a.rule.sortOrder - b.rule.sortOrder);

  const best = ranked[0];
  if (!best) return null;

  const result = {
    guideId,
    selectedRoleKey: roleKey,
    selectedRequestKey: requestKey,
    matchedRuleId: best.rule.id,
    confidenceScore: best.score,
    routeLabel: best.rule.routeLabel,
    routeClass: best.rule.routeClass,
    destinationLabel: best.rule.destinationLabel,
    destinationTeamId: best.rule.destinationTeamId,
    actionType: best.rule.actionType,
    requiresTicket: Boolean(best.rule.requiresTicket),
    requiresProjectPath: Boolean(best.rule.requiresProjectPath),
    title: best.rule.title,
    summary: best.rule.summary,
    nextSteps: safeJsonParse<string[]>(best.rule.nextStepsJson, []),
    externalUrl: best.rule.externalUrl,
    signals,
    alternatives: ranked.slice(1, 4).map(({ rule, score }) => ({
      ruleId: rule.id,
      score,
      routeLabel: rule.routeLabel,
      destinationLabel: rule.destinationLabel,
      title: rule.title,
    })),
  };

  return result;
}
