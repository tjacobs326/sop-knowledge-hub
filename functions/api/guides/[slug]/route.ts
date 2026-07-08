import { failure, readBody, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { routeDecisionGuide, type RoutingInput } from "../../../_shared/decision-guides";
import { getAuthUser } from "../../../_shared/auth";
import { newId, type PagesFunctionContext } from "../../../_shared/cloudflare";

function routeParam(context: PagesFunctionContext, key: string) {
  const params = (context as PagesFunctionContext & { params?: Record<string, string | string[]> }).params;
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value || "";
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const [payload, parseError] = await readBody<RoutingInput>(context.request);
  if (parseError) return parseError;

  try {
    const slug = routeParam(context, "slug");
    const result = await routeDecisionGuide(context.env.DB!, slug, payload || {});
    if (!result) return failure("ROUTE_NOT_FOUND", "No routing rule matched this guide request.", 404);

    const authUser = await getAuthUser(context);
    const sessionId = context.request.headers.get("x-sop-session-id") || "";
    await context.env.DB!.prepare(
      `INSERT INTO decision_routing_events (
        id,
        guide_id,
        selected_role_key,
        selected_request_key,
        matched_rule_id,
        input_json,
        result_json,
        confidence_score,
        session_id,
        user_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId("decision-event"),
        result.guideId,
        result.selectedRoleKey,
        result.selectedRequestKey,
        result.matchedRuleId,
        JSON.stringify(payload || {}),
        JSON.stringify(result),
        result.confidenceScore,
        sessionId,
        authUser?.id || null,
        new Date().toISOString(),
      )
      .run();

    return success({ result });
  } catch (error) {
    return failure(
      "ROUTE_EVALUATION_FAILED",
      error instanceof Error ? error.message : "Unable to evaluate routing guide.",
      500,
    );
  }
};

export const onRequestGet = () =>
  success({
    service: "Decision Guide Routing",
    method: "POST",
    example: {
      role: "learner-services",
      requestType: "media",
      details: "A Captivate activity completed but did not pass a grade back for one student.",
      impact: { gradesAffected: true, oneStudent: true },
    },
  });
