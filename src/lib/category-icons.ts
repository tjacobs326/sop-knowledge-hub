type CategoryIconInput = {
  name?: string;
  slug?: string;
  icon?: string;
};

type CategoryIconKey =
  | "home"
  | "search"
  | "finder"
  | "archive"
  | "ivanti"
  | "routing"
  | "brightspace"
  | "course"
  | "qa"
  | "ai"
  | "template"
  | "troubleshooting"
  | "saved"
  | "categories"
  | "request"
  | "default";

function normalize(value?: string) {
  return String(value || "").toLowerCase();
}

export function getCategoryIconKey(category: CategoryIconInput): CategoryIconKey {
  const slug = normalize(category.slug);
  const name = normalize(category.name);
  const icon = normalize(category.icon);
  const value = `${slug} ${name} ${icon}`;

  if (value.includes("home")) return "home";
  if (value.includes("search")) return "search";
  if (value.includes("finder") || value.includes("guide")) return "finder";
  if (value.includes("archive")) return "archive";
  if (value.includes("routing")) return "routing";
  if (value.includes("ivanti") || value.includes("ticketing")) return "ivanti";
  if (value.includes("brightspace") || value.includes("d2l")) return "brightspace";
  if (value.includes("course")) return "course";
  if (value.includes("qa") || value.includes("quality")) return "qa";
  if (value.includes("ai")) return "ai";
  if (value.includes("template")) return "template";
  if (value.includes("troubleshoot")) return "troubleshooting";
  if (value.includes("saved") || value.includes("bookmark")) return "saved";
  if (value.includes("categories") || value.includes("taxonomy")) return "categories";
  if (value.includes("request") || value.includes("submit")) return "request";

  return "default";
}

const tablerIconByKey: Record<CategoryIconKey, string> = {
  home: "home",
  search: "file-search",
  finder: "map-search",
  archive: "archive",
  ivanti: "ticket",
  routing: "route",
  brightspace: "book-2",
  course: "stack-2",
  qa: "shield-check",
  ai: "sparkles",
  template: "template",
  troubleshooting: "tool",
  saved: "bookmark",
  categories: "folders",
  request: "file-plus",
  default: "file-text",
};

export function renderCategoryIconSvg(category: CategoryIconInput) {
  const key = getCategoryIconKey(category);
  const icon = tablerIconByKey[key] ?? tablerIconByKey.default;
  const src = `/assets/tabler-vocate/tabler-icons/icons/outline/${icon}.svg`;
  return `<img class="category-art-icon category-art-icon--${key}" src="${src}" alt="" aria-hidden="true" loading="lazy" decoding="async" />`;
}
