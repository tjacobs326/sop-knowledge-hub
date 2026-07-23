type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
};

async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const selectedSubRole =
    typeof localStorage === "undefined" ? "" : localStorage.getItem("sopHubSelectedCreatorSubRole") || "";
  const response = await fetch(path, {
    ...init,
    cache: selectedSubRole ? "no-store" : init.cache,
    headers: {
      "content-type": "application/json",
      ...(selectedSubRole ? { "x-sop-sub-role": selectedSubRole } : {}),
      ...(init.headers || {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as ApiResult<T>;
  if (!response.ok || body.success === false) {
    throw new Error(body.error?.message || `API request failed: ${response.status}`);
  }
  return body.data as T;
}

export interface SopRequestInput {
  requestType: string;
  requestedTitle: string;
  departmentName: string;
  submittedByName: string;
  submittedByEmail: string;
  roleTitle?: string;
  description: string;
  priority?: "Low" | "Medium" | "High" | "Urgent";
  desiredCompletionAt?: string;
  existingSopId?: string;
  draftContent?: string;
  processSteps?: string;
  relatedLinks?: string[];
  documentationLocation?: string;
}

export function listSops(query = "") {
  return apiFetch(`/api/sops${query}`);
}

export function getSop(id: string) {
  return apiFetch(`/api/sops/${encodeURIComponent(id)}`);
}

export function createSopRequest(input: SopRequestInput) {
  return apiFetch<{ request: unknown; trackingUrl: string }>("/api/sop-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logSearch(query: string, resultCount: number, filters: Record<string, unknown> = {}) {
  return apiFetch("/api/search/log", {
    method: "POST",
    body: JSON.stringify({ query, resultCount, filters }),
  });
}
