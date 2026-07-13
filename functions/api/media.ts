import { failure } from "../_shared/api";
import { getClientIp, jsonResponse, newId, type PagesFunctionContext } from "../_shared/cloudflare";
import { getAuthUser, hasPermission, requirePermission } from "../_shared/auth";
import { requireSopOwnership } from "../_shared/ownership";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_ALT_TEXT_LENGTH = 125;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4"]);
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "mp4"]);

function inferAssetType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  return "Other";
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120) || "upload";
}

function isAllowedFile(file: File) {
  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  return ALLOWED_MIME_TYPES.has(file.type) && ALLOWED_EXTENSIONS.has(extension);
}

async function ensureMediaTables(db: NonNullable<PagesFunctionContext["env"]["DB"]>) {
  const info = await db.prepare("PRAGMA table_info(media_assets)").all<{ name: string }>();
  const columns = new Set((info.results || []).map((row) => row.name));
  if (!columns.has("is_decorative")) {
    await db.prepare("ALTER TABLE media_assets ADD COLUMN is_decorative INTEGER NOT NULL DEFAULT 0").run();
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS procedure_steps (
        id TEXT PRIMARY KEY,
        sop_version_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        instructions TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (sop_version_id, step_number)
      )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS procedure_step_media (
        procedure_step_id TEXT NOT NULL,
        media_asset_id TEXT NOT NULL,
        relationship TEXT NOT NULL DEFAULT 'Instructional Media',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (procedure_step_id, media_asset_id, relationship)
      )`,
    )
    .run();
}

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  if (!env.DB) {
    return jsonResponse({ error: "D1 database binding DB is not available." }, 503);
  }

  if (!env.SOP_MEDIA) {
    return jsonResponse(
      { error: "R2 media binding SOP_MEDIA is not available. Enable R2 and bind the bucket first." },
      503,
    );
  }
  const auth = await requirePermission({ request, env }, "Upload Media");
  if (auth.response) return auth.response;
  await ensureMediaTables(env.DB);

  const formData = await request.formData();
  const uploadedByUserId = String(formData.get("uploadedByUserId") || auth.user?.id || "") || null;
  const purpose = String(formData.get("purpose") || "Other");
  const entityType = String(formData.get("entityType") || "");
  const entityId = String(formData.get("entityId") || "") || null;
  const isDecorative = String(formData.get("accessibilityStatus") || "") === "decorative";
  const altText = String(formData.get("altText") || "").trim();
  const caption = String(formData.get("caption") || "") || null;
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (!files.length) {
    const singleFile = formData.get("file");
    if (singleFile instanceof File) files.push(singleFile);
  }

  if (!files.length) {
    return jsonResponse({ error: "Attach at least one file." }, 400);
  }
  if (altText.length > MAX_ALT_TEXT_LENGTH) {
    return jsonResponse({ error: "Alternative text must be 125 characters or fewer." }, 400);
  }

  const saved = [];

  for (const file of files) {
    if (!isAllowedFile(file)) {
      return jsonResponse({ error: `${file.name} is not an allowed PNG, JPG, JPEG, WebP, or MP4 file.` }, 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse({ error: `${file.name} is larger than the 50 MB upload limit.` }, 413);
    }

    const id = newId("media");
    const safeFileName = sanitizeFileName(file.name);
    const objectKey = `media/${new Date().toISOString().slice(0, 10)}/${id}/${safeFileName}`;
    const arrayBuffer = await file.arrayBuffer();

    await env.SOP_MEDIA.put(objectKey, arrayBuffer, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
        contentDisposition: `inline; filename="${safeFileName}"`,
      },
      customMetadata: {
        originalFileName: file.name,
        uploadedByUserId: uploadedByUserId || "",
        purpose,
      },
    });

    await env.DB.prepare(
      `INSERT INTO media_assets (
        id, asset_type, purpose, original_file_name, display_name, mime_type, size_bytes,
        storage_provider, bucket_name, object_key, public_url, alt_text, is_decorative, caption,
        uploaded_by_user_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'r2', ?, ?, ?, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
      .bind(
        id,
        inferAssetType(file.type),
        purpose,
        file.name,
        file.name,
        file.type || "application/octet-stream",
        file.size,
        "sop-knowledge-hub-media",
        objectKey,
        `/api/media/?id=${encodeURIComponent(id)}`,
        isDecorative ? "" : altText,
        isDecorative ? 1 : 0,
        caption,
        uploadedByUserId,
      )
      .run();

    if (entityType === "sop" && entityId) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO sop_media (sop_id, media_asset_id, relationship, sort_order)
         VALUES (?, ?, ?, 0)`,
      )
        .bind(entityId, id, purpose === "SOP Step" ? "Screenshot" : "Attachment")
        .run();
    }

    env.SOP_ANALYTICS?.writeDataPoint({
      blobs: ["media_upload", inferAssetType(file.type), purpose, file.type || "unknown"],
      doubles: [1, file.size],
      indexes: [uploadedByUserId || getClientIp(request) || "anonymous"],
    });

    saved.push({
      id,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      sizeBytes: file.size,
      assetType: inferAssetType(file.type),
      url: `/api/media/?id=${encodeURIComponent(id)}`,
      altText: isDecorative ? "" : altText,
      accessibilityStatus: isDecorative ? "decorative" : altText ? "meaningful" : "",
      isDecorative,
      caption,
    });
  }

  return jsonResponse({ uploaded: saved }, 201);
};

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  if (!env.DB || !env.SOP_MEDIA) {
    return jsonResponse({ error: "Media storage is not configured." }, 503);
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonResponse({ error: "Missing media id." }, 400);

  const asset = await env.DB.prepare(
    `SELECT id, object_key, mime_type, original_file_name, uploaded_by_user_id AS uploadedByUserId, status
     FROM media_assets
     WHERE id = ? AND status = 'Active'`,
  )
    .bind(id)
    .first<{ id: string; object_key: string; mime_type: string; original_file_name: string; uploadedByUserId?: string }>();

  if (!asset) return jsonResponse({ error: "Media asset not found." }, 404);

  const related = await env.DB.prepare(
    `SELECT DISTINCT sops.id, sops.status, COALESCE(sops.is_active, 1) AS isActive
     FROM media_assets
     LEFT JOIN sop_media ON sop_media.media_asset_id = media_assets.id
     LEFT JOIN sop_version_media ON sop_version_media.media_asset_id = media_assets.id
     LEFT JOIN procedure_step_media ON procedure_step_media.media_asset_id = media_assets.id
     LEFT JOIN procedure_steps ON procedure_steps.id = procedure_step_media.procedure_step_id
     LEFT JOIN sops ON sops.id = sop_media.sop_id
       OR sops.current_version_id = sop_version_media.sop_version_id
       OR sops.current_version_id = procedure_steps.sop_version_id
     WHERE media_assets.id = ?
      AND sops.id IS NOT NULL`,
  )
    .bind(id)
    .all<{ id: string; status: string; isActive: number }>();
  const relatedSops = related.results || [];
  const publishedAllowed = relatedSops.some((sop) => sop.status === "Published" && Number(sop.isActive || 0) === 1);
  const user = await getAuthUser({ request, env });
  const uploaderAllowed = Boolean(user && (user.role === "admin" || user.id === asset.uploadedByUserId));
  if (!publishedAllowed && !uploaderAllowed) {
    return jsonResponse({ error: "You do not have permission to view this media asset." }, 403);
  }

  const object = await env.SOP_MEDIA.get(asset.object_key);
  if (!object?.body) return jsonResponse({ error: "Media object not found." }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", asset.mime_type || headers.get("content-type") || "application/octet-stream");
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("content-disposition", `inline; filename="${sanitizeFileName(asset.original_file_name)}"`);

  return new Response(object.body, { headers });
};

export const onRequestDelete = async ({ request, env }: PagesFunctionContext) => {
  if (!env.DB || !env.SOP_MEDIA) {
    return jsonResponse({ error: "Media storage is not configured." }, 503);
  }
  const auth = await requirePermission({ request, env }, "Upload Media");
  if (auth.response || !auth.user) return auth.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const sopId = url.searchParams.get("sopId") || "";
  if (!id) return jsonResponse({ error: "Missing media id." }, 400);

  const asset = await env.DB.prepare(
    `SELECT id, object_key, uploaded_by_user_id AS uploadedByUserId
     FROM media_assets
     WHERE id = ? AND status = 'Active'
     LIMIT 1`,
  )
    .bind(id)
    .first<{ id: string; object_key: string; uploadedByUserId?: string }>();
  if (!asset) return jsonResponse({ error: "Media asset not found." }, 404);

  if (sopId) {
    const ownership = await requireSopOwnership({ request, env }, auth.user, sopId);
    if (ownership.response) return ownership.response;
  } else if (auth.user.role !== "admin" && auth.user.id !== asset.uploadedByUserId && !hasPermission(auth.user, "Manage Media")) {
    return failure("FORBIDDEN", "You do not have permission to delete this media asset.", 403);
  }

  await env.DB.prepare(
    `UPDATE media_assets
     SET status = 'Deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(id)
    .run();

  return jsonResponse({ ok: true });
};
