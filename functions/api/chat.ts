import { aiKnowledgeSources, type AiKnowledgeSource } from "../../src/data/ai-knowledge";
import { getAuthUser } from "../_shared/auth";
import { type PagesFunctionContext } from "../_shared/cloudflare";

type ChatRole = "normal" | "creator" | "admin";

interface ChatRequestBody {
  message?: string;
  role?: ChatRole;
}

interface WorkersAiTextResponse {
  response?: string;
  result?: {
    response?: string;
  };
}

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const MIN_RELEVANCE_SCORE = 1;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function tokenize(value: string) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "also",
    "and",
    "are",
    "can",
    "for",
    "from",
    "have",
    "how",
    "into",
    "need",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "with",
    "you",
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function sourceText(source: AiKnowledgeSource) {
  return [
    source.title,
    source.category,
    source.purpose,
    source.owner,
    source.tools.join(" "),
    source.tags.join(" "),
    source.excerpt,
  ]
    .join(" ")
    .toLowerCase();
}

function getAllowedSources(role: ChatRole) {
  return aiKnowledgeSources.filter((source) => {
    if (source.access === "published") return true;
    return role === "admin";
  });
}

function rankSources(message: string, role: ChatRole) {
  const tokens = tokenize(message);
  const allowedSources = getAllowedSources(role);

  return allowedSources
    .map((source) => {
      const haystack = sourceText(source);
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { source, score };
    })
    .filter((match) => match.score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title))
    .slice(0, 4);
}

function buildContext(matches: Array<{ source: AiKnowledgeSource; score: number }>) {
  return matches
    .map(
      ({ source }, index) => `[${index + 1}] ${source.title}
Status: ${source.status}
Source type: ${source.sourceType}
Category: ${source.category}
Owner: ${source.owner}
Tools: ${source.tools.join(", ")}
URL: ${source.url}
Purpose: ${source.purpose}
Excerpt: ${source.excerpt}`,
    )
    .join("\n\n");
}

function extractAiText(value: unknown) {
  if (typeof value === "string") return value;
  const response = value as WorkersAiTextResponse;
  return response.response || response.result?.response || "";
}

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: "Send a valid JSON request." }, 400);
  }

  const message = String(body.message || "").trim();
  const authUser = await getAuthUser({ request, env });
  const role: ChatRole = authUser?.role === "admin" ? "admin" : authUser?.role === "creator" ? "creator" : "normal";

  if (!message) {
    return jsonResponse({ error: "Ask a question first." }, 400);
  }

  if (!env.AI) {
    return jsonResponse(
      {
        error:
          "Cloudflare Workers AI is not available yet. Confirm the AI binding is enabled on the Pages project.",
      },
      503,
    );
  }

  const matches = rankSources(message, role);

  if (!matches.length) {
    return jsonResponse({
      answer:
        "I could not find an approved SOP source that answers that. Please try a more specific question or submit a request for a missing SOP.",
      sources: [],
      role,
      sourcePolicy:
        role === "admin"
          ? "Admin mode can include published SOPs plus draft and review items."
          : "Only approved or published SOPs were searched.",
    });
  }

  const systemPrompt = `You are the SOP Knowledge Hub assistant. Answer only from the provided sources.
If the sources do not answer the question, say you do not have enough approved SOP information.
Do not invent policies, steps, owners, tools, dates, or links.
Keep the answer concise and practical.
Always include a short "Sources" line using the source titles.`;

  const userPrompt = `User role: ${role}
Source policy: ${
    role === "admin"
      ? "Admin mode can include published SOPs plus draft and review items."
      : "Use approved or published SOP sources only."
  }

Question:
${message}

Allowed SOP source excerpts:
${buildContext(matches)}`;

  try {
    const aiResult = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 600,
    });

    return jsonResponse({
      answer: extractAiText(aiResult).trim(),
      sources: matches.map(({ source }) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        status: source.status,
        sourceType: source.sourceType,
      })),
      role,
      sourcePolicy:
        role === "admin"
          ? "Admin mode can include published SOPs plus draft and review items."
          : "Only approved or published SOPs were searched.",
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "The AI service could not answer right now. Please try again in a moment.",
        detail: error instanceof Error ? error.message : "Unknown Workers AI error",
      },
      502,
    );
  }
};

export const onRequestGet = () =>
  jsonResponse({
    ok: true,
    service: "SOP Knowledge Hub AI Chat",
    model: MODEL,
    sourcePolicy: "Normal users and creators search approved/published SOPs only. Admins can include draft/review sources.",
  });
