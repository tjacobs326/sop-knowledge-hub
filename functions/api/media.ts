import {
  getClientIp,
  jsonResponse,
  newId,
  type PagesFunctionContext,
} from "../_shared/cloudflare";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function inferAssetType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType.includes("document")) {
    return "Document";
  }
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
  return (
    ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix)) ||
    ALLOWED_MIME_TYPES.has(file.type)
  );
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

  const formData = await request.formData();
  const uploadedByUserId = String(formData.get("uploadedByUserId") || "") || null;
  const purpose = String(formData.get("purpose") || "Other");
  const entityType = String(formData.get("entityType") || "");
  const entityId = String(formData.get("entityId") || "") || null;
  const altText = String(formData.get("altText") || "") || null;
  const caption = String(formData.get("caption") || "") || null;
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (!files.length) {
    const singleFile = formData.get("file");
    if (singleFile instanceof File) files.push(singleFile);
  }

  if (!files.length) {
    return jsonResponse({ error: "Attach at least one file." }, 400);
  }

  const saved = [];

  for (const file of files) {
    if (!isAllowedFile(file)) {
      return jsonResponse({ error: `${file.name} is not an allowed image, video, or document type.` }, 400);
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
        storage_provider, bucket_name, object_key, public_url, alt_text, caption,
        uploaded_by_user_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'r2', ?, ?, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
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
        `/api/media?id=${encodeURIComponent(id)}`,
        altText,
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
      sizeBytes: file.size,
      assetType: inferAssetType(file.type),
      url: `/api/media?id=${encodeURIComponent(id)}`,
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
    `SELECT id, object_key, mime_type, original_file_name, status
     FROM media_assets
     WHERE id = ? AND status = 'Active'`,
  )
    .bind(id)
    .first<{ object_key: string; mime_type: string; original_file_name: string }>();

  if (!asset) return jsonResponse({ error: "Media asset not found." }, 404);

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
