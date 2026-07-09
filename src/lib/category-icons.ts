type CategoryIconInput = {
  name?: string;
  slug?: string;
  icon?: string;
};

type CategoryIconKey =
  | "archive"
  | "ivanti"
  | "routing"
  | "brightspace"
  | "course"
  | "qa"
  | "ai"
  | "template"
  | "troubleshooting"
  | "default";

const palette = {
  ink: "#10225b",
  orange: "#ff8a1f",
  blue: "#18bcea",
  purple: "#8e6dff",
  green: "#8ddf7a",
  softBlue: "#eaf2ff",
  softOrange: "#fff2df",
  softPurple: "#f1ecff",
  softGreen: "#eaf8ed",
  white: "#ffffff",
};

function normalize(value?: string) {
  return String(value || "").toLowerCase();
}

export function getCategoryIconKey(category: CategoryIconInput): CategoryIconKey {
  const slug = normalize(category.slug);
  const name = normalize(category.name);
  const icon = normalize(category.icon);
  const value = `${slug} ${name} ${icon}`;

  if (value.includes("archive")) return "archive";
  if (value.includes("routing")) return "routing";
  if (value.includes("ivanti") || value.includes("ticketing")) return "ivanti";
  if (value.includes("brightspace") || value.includes("d2l")) return "brightspace";
  if (value.includes("course")) return "course";
  if (value.includes("qa") || value.includes("quality")) return "qa";
  if (value.includes("ai")) return "ai";
  if (value.includes("template")) return "template";
  if (value.includes("troubleshoot")) return "troubleshooting";

  return "default";
}

function svg(key: CategoryIconKey, body: string) {
  return `<svg class="category-art-icon category-art-icon--${key}" viewBox="0 0 112 88" role="img" aria-hidden="true" focusable="false">${body}</svg>`;
}

const sharedSpark = `
  <path d="M88 18v8M84 22h8" fill="none" stroke="${palette.orange}" stroke-width="3.2" stroke-linecap="round" />
  <path d="M25 68v7M21.5 71.5h7" fill="none" stroke="#b8c2d4" stroke-width="2.8" stroke-linecap="round" />
`;

export function renderCategoryIconSvg(category: CategoryIconInput) {
  const key = getCategoryIconKey(category);

  switch (key) {
    case "archive":
      return svg(
        key,
        `
          <path d="M24 63c-11-16-2-39 18-48 19-8 42 0 49 18 8 19-5 40-26 45-17 4-34-2-41-15Z" fill="${palette.softOrange}" />
          <path d="M28 31h56l-5 14H33l-5-14Z" fill="${palette.orange}" stroke="${palette.ink}" stroke-width="4.2" stroke-linejoin="round" />
          <path d="M34 43h44v27H34V43Z" fill="${palette.white}" stroke="${palette.ink}" stroke-width="4.2" stroke-linejoin="round" />
          <path d="M48 51h16" fill="none" stroke="${palette.ink}" stroke-width="4.2" stroke-linecap="round" />
          <path d="M56 28v24M47 43l9 9 9-9" fill="none" stroke="${palette.ink}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" />
          ${sharedSpark}
        `,
      );

    case "ivanti":
      return svg(
        key,
        `
          <path d="M22 62c-10-16-2-38 16-47 18-8 41-1 49 16 8 18-4 38-24 44-16 5-33 0-41-13Z" fill="${palette.softBlue}" />
          <path d="M31 30c3 0 5-2 5-5h40c0 3 2 5 5 5v27c-3 0-5 2-5 5H36c0-3-2-5-5-5V30Z" fill="${palette.orange}" stroke="${palette.ink}" stroke-width="5" stroke-linejoin="round" />
          <path d="M44 41h24M44 51h16" fill="none" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round" />
          <path d="m63 55 5 5 9-13" fill="none" stroke="${palette.white}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" />
          ${sharedSpark}
        `,
      );

    case "routing":
      return svg(
        key,
        `
          <path d="M23 63c-11-17-1-40 18-49 20-9 44 0 51 19 7 19-6 39-28 45-17 4-34-2-41-15Z" fill="${palette.softPurple}" />
          <circle cx="31" cy="31" r="11" fill="${palette.white}" stroke="${palette.ink}" stroke-width="4" />
          <circle cx="78" cy="31" r="11" fill="${palette.orange}" stroke="${palette.ink}" stroke-width="4" />
          <circle cx="55" cy="62" r="11" fill="${palette.blue}" stroke="${palette.ink}" stroke-width="4" />
          <path d="M42 31h24M73 41 62 53M38 41l11 12" fill="none" stroke="${palette.ink}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="m64 25 7 6-7 6" fill="none" stroke="${palette.ink}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" />
          ${sharedSpark}
        `,
      );

    case "brightspace":
      return svg(
        key,
        `
          <path d="M18 65c-10-16-1-39 20-49 20-9 45-1 53 18 8 18-5 39-28 45-18 4-36-1-45-14Z" fill="${palette.softBlue}" />
          <path d="M25 26c12-3 23 0 32 8v38c-10-8-21-11-32-8V26Z" fill="${palette.white}" stroke="${palette.ink}" stroke-width="4" stroke-linejoin="round" />
          <path d="M57 34c10-8 21-11 32-8v38c-11-3-22 0-32 8V34Z" fill="#dff5ff" stroke="${palette.ink}" stroke-width="4" stroke-linejoin="round" />
          <path d="M36 40c5-.5 10 .4 14 3M36 51c5-.5 10 .4 14 3M68 41c4-2 8-2.7 13-2M68 52c4-2 8-2.7 13-2" fill="none" stroke="${palette.blue}" stroke-width="3.4" stroke-linecap="round" />
          <path d="M57 34v38" fill="none" stroke="${palette.ink}" stroke-width="4" stroke-linecap="round" />
          ${sharedSpark}
        `,
      );

    case "course":
      return svg(
        key,
        `
          <path d="M24 63c-11-16-2-38 17-47 18-9 41-1 49 16 8 18-4 39-24 45-17 5-34-1-42-14Z" fill="${palette.softPurple}" />
          <path d="M56 16 24 31l32 16 32-16-32-15Z" fill="${palette.blue}" stroke="${palette.ink}" stroke-width="4.4" stroke-linejoin="round" />
          <path d="m27 43 29 15 29-15" fill="none" stroke="${palette.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
          <path d="m27 43 29 15 29-15" fill="none" stroke="${palette.orange}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="m30 55 26 13 26-13" fill="none" stroke="${palette.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
          <path d="m30 55 26 13 26-13" fill="none" stroke="${palette.purple}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" />
          ${sharedSpark}
        `,
      );

    case "qa":
      return svg(
        key,
        `
          <path d="M24 63c-10-16-1-39 18-48 19-9 43-1 51 18 7 18-5 39-27 45-17 5-34-1-42-15Z" fill="${palette.softOrange}" />
          <path d="M56 19 78 28v16c0 16-8 27-22 34-14-7-22-18-22-34V28l22-9Z" fill="${palette.ink}" stroke="${palette.ink}" stroke-width="4.2" stroke-linejoin="round" />
          <path d="m45 48 8 8 16-21" fill="none" stroke="${palette.white}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
          ${sharedSpark}
        `,
      );

    case "ai":
      return svg(
        key,
        `
          <path d="M23 62c-10-16-2-38 16-47 19-9 42-1 50 17 8 18-4 39-25 45-16 5-33-1-41-15Z" fill="${palette.softPurple}" />
          <path d="M56 18 62 38l20 6-20 6-6 20-6-20-20-6 20-6 6-20Z" fill="#ff5572" stroke="${palette.ink}" stroke-width="4.8" stroke-linejoin="round" />
          <path d="M32 70h48" fill="none" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round" />
          <path d="M36 70h40" fill="none" stroke="${palette.blue}" stroke-width="4.8" stroke-linecap="round" />
          ${sharedSpark}
        `,
      );

    case "template":
      return svg(
        key,
        `
          <path d="M22 63c-10-16-1-39 18-48 19-9 43-1 51 18 8 19-5 40-27 45-17 4-34-2-42-15Z" fill="${palette.softBlue}" />
          <path d="M35 18h29l15 15v38H35V18Z" fill="${palette.white}" stroke="${palette.ink}" stroke-width="4.4" stroke-linejoin="round" />
          <path d="M64 18v16h15" fill="${palette.orange}" stroke="${palette.ink}" stroke-width="4.4" stroke-linejoin="round" />
          <path d="M45 44h24M45 54h20M45 63h14" fill="none" stroke="${palette.ink}" stroke-width="4" stroke-linecap="round" />
          ${sharedSpark}
        `,
      );

    case "troubleshooting":
      return svg(
        key,
        `
          <path d="M22 62c-10-16-1-38 18-47 19-8 42 0 50 18 8 19-5 39-26 45-17 4-34-2-42-16Z" fill="${palette.softGreen}" />
          <path d="M70 23c-6-2-13 0-17 5-4 5-4 11-1 16L31 65l10 10 21-21c5 2 12 1 16-3 5-5 7-12 4-18l-9 9-10-10 7-9Z" fill="${palette.white}" stroke="${palette.ink}" stroke-width="4.2" stroke-linejoin="round" />
          <path d="M35 65 25 75" fill="none" stroke="${palette.orange}" stroke-width="5" stroke-linecap="round" />
          ${sharedSpark}
        `,
      );

    default:
      return svg(
        key,
        `
          <path d="M22 63c-10-16-1-39 18-48 19-9 43-1 51 18 8 19-5 40-27 45-17 4-34-2-42-15Z" fill="${palette.softBlue}" />
          <path d="M24 32h27l7 8h31v30H24V32Z" fill="${palette.white}" stroke="${palette.ink}" stroke-width="4.4" stroke-linejoin="round" />
          <path d="M24 40h64v30H24V40Z" fill="#dff5ff" stroke="${palette.ink}" stroke-width="4.4" stroke-linejoin="round" />
          <path d="M35 53h31M35 62h22" fill="none" stroke="${palette.ink}" stroke-width="4" stroke-linecap="round" />
          ${sharedSpark}
        `,
      );
  }
}
