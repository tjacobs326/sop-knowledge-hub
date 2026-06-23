import {
  getClientIp,
  jsonResponse,
  newId,
  type PagesFunctionContext,
} from "../../_shared/cloudflare";

type AnalyticsEventType =
  | "page_view"
  | "sop_view"
  | "sop_export"
  | "search"
  | "feedback";

interface AnalyticsPayload {
  eventType?: AnalyticsEventType;
  path?: string;
  referrer?: string;
  sessionId?: string;
  userId?: string;
  sopId?: string;
  sopVersionId?: string;
  source?: string;
  exportType?: "Print" | "PDF" | "Copy Link";
  query?: string;
  filters?: Record<string, string>;
  resultsCount?: number;
  clickedSopId?: string;
  rating?: "Helpful" | "Not Helpful";
  comment?: string;
}

const allowedPaths = new Set(["Direct", "Search", "Guided Finder", "Related SOP", "Admin", "External"]);

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  if (!env.DB) return jsonResponse({ error: "D1 database binding DB is not available." }, 503);

  let payload: AnalyticsPayload;
  try {
    payload = (await request.json()) as AnalyticsPayload;
  } catch {
    return jsonResponse({ error: "Send valid JSON." }, 400);
  }

  const eventType = payload.eventType;
  const userAgent = request.headers.get("user-agent") || "";
  const ipAddress = getClientIp(request);
  const sessionId = String(payload.sessionId || "") || null;
  const userId = String(payload.userId || "") || null;

  if (!eventType) return jsonResponse({ error: "eventType is required." }, 400);

  if (eventType === "page_view") {
    await env.DB.prepare(
      `INSERT INTO page_view_events (id, user_id, path, referrer, user_agent, session_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId("pageview"),
        userId,
        String(payload.path || "/"),
        String(payload.referrer || ""),
        userAgent,
        sessionId,
      )
      .run();
  }

  if (eventType === "sop_view" && payload.sopId) {
    const source = allowedPaths.has(String(payload.source)) ? String(payload.source) : "Direct";
    await env.DB.prepare(
      `INSERT INTO sop_view_events (id, sop_id, sop_version_id, user_id, session_id, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId("sopview"), payload.sopId, payload.sopVersionId || null, userId, sessionId, source)
      .run();
  }

  if (eventType === "sop_export" && payload.sopId) {
    await env.DB.prepare(
      `INSERT INTO sop_export_events (id, sop_id, user_id, export_type)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(newId("export"), payload.sopId, userId, payload.exportType || "Copy Link")
      .run();
  }

  if (eventType === "search" && payload.query) {
    const resultsCount = Number(payload.resultsCount || 0);
    await env.DB.prepare(
      `INSERT INTO search_logs (
        id, user_id, query, filters_json, results_count, clicked_sop_id, no_results
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId("search"),
        userId,
        String(payload.query).slice(0, 250),
        JSON.stringify(payload.filters || {}),
        resultsCount,
        payload.clickedSopId || null,
        resultsCount === 0 ? 1 : 0,
      )
      .run();
  }

  if (eventType === "feedback" && payload.sopId && payload.rating) {
    await env.DB.prepare(
      `INSERT INTO feedback (id, sop_id, user_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(newId("feedback"), payload.sopId, userId, payload.rating, payload.comment || null)
      .run();
  }

  env.SOP_ANALYTICS?.writeDataPoint({
    blobs: [
      eventType,
      String(payload.path || ""),
      String(payload.sopId || ""),
      String(payload.query || ""),
      String(payload.rating || ""),
    ],
    doubles: [1, Number(payload.resultsCount || 0)],
    indexes: [sessionId || userId || ipAddress || "anonymous"],
  });

  return jsonResponse({ ok: true });
};
