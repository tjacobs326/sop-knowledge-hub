export interface D1PreparedStatement {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  run: () => Promise<unknown>;
}

export interface D1DatabaseBinding {
  prepare: (query: string) => D1PreparedStatement;
  batch?: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
}

export interface R2ObjectBinding {
  body?: ReadableStream;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
}

export interface R2BucketBinding {
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
        contentDisposition?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectBinding | null>;
  delete: (key: string) => Promise<void>;
}

export interface AnalyticsEngineBinding {
  writeDataPoint: (event: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }) => void;
}

export interface PlatformEnv {
  DB?: D1DatabaseBinding;
  SOP_MEDIA?: R2BucketBinding;
  SOP_ANALYTICS?: AnalyticsEngineBinding;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  AI?: {
    run: (model: string, input: unknown) => Promise<unknown>;
  };
}

export interface PagesFunctionContext {
  request: Request;
  env: PlatformEnv;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export function newId(prefix: string) {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return `${prefix}-${cryptoObject.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
