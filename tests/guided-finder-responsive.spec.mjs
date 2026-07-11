import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { test, expect } from "@playwright/test";

const distDir = normalize(join(process.cwd(), "dist"));
const widths = [320, 360, 375, 390, 412, 430, 600, 768, 820, 1024, 1280, 1440, 1920];
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
]);
const guidedNeedLabels = [
  "Use a system or tool",
  "Complete a process",
  "Learn how to perform a task",
  "Review or approve work",
  "Troubleshoot a problem",
];

const apiGet = {
  success: true,
  data: {
    user: null,
    steps: [
      {
        key: "department",
        number: 1,
        shortLabel: "Role",
        question: "Who are you?",
        help: "Choose the department or team most related to the SOP you need.",
        options: [
          { value: "Instructional Technology With A Very Long Department Name", label: "Instructional Technology With A Very Long Department Name", hint: "Active backend department" },
          { value: "Curriculum Design", label: "Curriculum Design", hint: "Active backend department" },
        ],
      },
      {
        key: "task",
        number: 2,
        shortLabel: "Need",
        question: "What do you need?",
        help: "Choose the kind of work you are trying to complete.",
        options: guidedNeedLabels.map((label) => ({ value: label, label })),
      },
    ],
    options: { departments: [], categories: [], tools: [], tasks: [], roles: [] },
    model: "deterministic-fallback",
    sourcePolicy: "Mocked backend-driven options for responsive smoke testing.",
  },
};

const apiPost = {
  success: true,
  data: {
    mode: "results",
    total: 3,
    model: "deterministic-fallback",
    sourcePolicy: "Only active published SOP records authorized by the backend are returned.",
    results: [
      {
        title: "A Very Long Guided Finder SOP Title That Must Wrap Without Causing Horizontal Overflow In Any Viewport",
        summary: "This long purpose statement verifies that descriptions, metadata, and match explanations wrap naturally on mobile, tablet, laptop, and desktop layouts without clipping or horizontal scrolling.",
        department: "Instructional Technology With A Very Long Department Name",
        category: "Brightspace D2L Course Copy And Troubleshooting",
        tools: ["Brightspace D2L", "Course Builder With An Extra Long Tool Name"],
        lastReviewed: "2026-07-11",
        updatedAt: "2026-07-11",
        relevance: "Matches the selected department, task, and long backend taxonomy values while preserving readable wrapping.",
        href: "/sops/detail/?slug=copy-a-brightspace-d2l-course-shell",
      },
    ],
  },
};

let server;
let baseUrl;

async function serveFile(pathname) {
  const safePath = pathname.replace(/^\/+/, "").replace(/\.\./g, "");
  const filePath = join(distDir, safePath.endsWith("/") ? `${safePath}index.html` : safePath || "index.html");
  return readFile(filePath).catch(() => readFile(join(distDir, "404.html")));
}

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/guided-finder") {
        let requestBody = "";
        for await (const chunk of req) requestBody += chunk;
        const parsed = requestBody ? JSON.parse(requestBody) : {};
        const body = req.method === "POST" && parsed.mode !== "options" ? apiPost : apiGet;
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(body));
        return;
      }
      const file = await serveFile(url.pathname);
      res.writeHead(200, { "content-type": contentTypes.get(extname(url.pathname)) || "text/html; charset=utf-8" });
      res.end(file);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function expectNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }));
  const overflow = Math.max(metrics.scrollWidth - metrics.clientWidth, metrics.bodyScrollWidth - metrics.bodyClientWidth);
  expect(overflow, `${label} should not horizontally overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(1);
}

async function expectResultsUseReadableColumns(page, label) {
  await expect(page.locator(".guided-workflow__match").first()).toBeVisible();
  const metrics = await page.locator(".guided-workflow__match").first().evaluate((card) => {
    const title = card.querySelector("h3");
    const link = card.querySelector("h3 a");
    const cardStyle = window.getComputedStyle(card);
    const linkStyle = link ? window.getComputedStyle(link) : null;
    return {
      cardGridColumns: cardStyle.gridTemplateColumns,
      cardWidth: card.getBoundingClientRect().width,
      titleWidth: title?.getBoundingClientRect().width || 0,
      titleText: title?.textContent?.trim() || "",
      linkWordBreak: linkStyle?.wordBreak || "",
      linkOverflowWrap: linkStyle?.overflowWrap || "",
    };
  });
  expect(metrics.cardGridColumns.split(" ").length, `${label} result card should not use a cramped two-column content grid`).toBe(1);
  expect(metrics.titleWidth, `${label} SOP title should have readable width: ${JSON.stringify(metrics)}`).toBeGreaterThan(
    Math.min(180, metrics.cardWidth * 0.65),
  );
  expect(metrics.linkWordBreak, `${label} SOP title should not break mid-word`).toBe("normal");
  expect(metrics.linkOverflowWrap, `${label} SOP title should not break every character`).not.toBe("anywhere");
}

async function expectNeedOptionsAreApprovedOnly(page) {
  const labels = await page.locator("#guided-finder-choices .guided-workflow__choice strong").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim()).filter(Boolean),
  );
  expect(labels).toEqual(guidedNeedLabels);
}

async function expectChoiceLabelsWrapByWords(page, label) {
  const styles = await page.locator("#guided-finder-choices .guided-workflow__choice strong").evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = window.getComputedStyle(node);
      return {
        text: node.textContent?.trim(),
        overflowWrap: style.overflowWrap,
        wordBreak: style.wordBreak,
        hyphens: style.hyphens,
      };
    }),
  );
  for (const item of styles) {
    expect(item.overflowWrap, `${label}: ${item.text} should not split mid-word`).not.toBe("anywhere");
    expect(item.wordBreak, `${label}: ${item.text} should not split mid-word`).toBe("normal");
    expect(item.hyphens, `${label}: ${item.text} should not hyphenate labels`).toBe("none");
  }
}

async function expectChoiceGridIsHorizontalWhenRoomy(page, width) {
  const columns = await page.locator("#guided-finder-choices").evaluate((grid) =>
    window.getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
  if (width >= 1280) {
    expect(columns, `${width}px should use a roomy multi-column Need layout without cramping labels`).toBeGreaterThanOrEqual(3);
  } else if (width >= 600) {
    expect(columns, `${width}px should keep a usable guided-choice stack without overflow`).toBeGreaterThanOrEqual(1);
  } else {
    expect(columns, `${width}px should remain a compact mobile stack`).toBeGreaterThanOrEqual(1);
  }
}

async function expectChoiceTextFitsCards(page, label) {
  const overflows = await page.locator("#guided-finder-choices .guided-workflow__choice").evaluateAll((cards) =>
    cards
      .map((card) => {
        const text = card.querySelector("strong");
        if (!text) return null;
        const cardRect = card.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        return {
          text: text.textContent?.trim() || "",
          cardRight: cardRect.right,
          textRight: textRect.right,
          cardLeft: cardRect.left,
          textLeft: textRect.left,
        };
      })
      .filter(Boolean)
      .filter((item) => item.textRight > item.cardRight + 1 || item.textLeft < item.cardLeft - 1),
  );
  expect(overflows, `${label} choice labels should stay inside their cards`).toEqual([]);
}

async function expectPanelsUseFullLane(page, label) {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector(".guided-workflow__shell");
    const main = document.querySelector(".guided-workflow__main");
    const results = document.querySelector(".guided-workflow__results");
    return {
      shellWidth: shell?.getBoundingClientRect().width || 0,
      mainWidth: main?.getBoundingClientRect().width || 0,
      resultsWidth: results?.getBoundingClientRect().width || 0,
    };
  });
  expect(metrics.mainWidth, `${label} main panel should use the available lane: ${JSON.stringify(metrics)}`).toBeGreaterThan(
    metrics.shellWidth * 0.94,
  );
  expect(metrics.resultsWidth, `${label} results panel should use the available lane: ${JSON.stringify(metrics)}`).toBeGreaterThan(
    metrics.shellWidth * 0.94,
  );
}

for (const width of widths) {
  test(`Guided Finder reflows without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 740 : 900 });
    await page.addInitScript(() => {
      localStorage.setItem("sopHubSelectedRole", "normal");
      localStorage.removeItem("sopHubSelectedCreatorSubRole");
    });
    await page.goto(`${baseUrl}/guided-finder/`, { waitUntil: "networkidle" });
    await expect(page.locator(".guided-workflow__shell")).toBeVisible();
    await expectNoOverflow(page, `${width}px initial`);
    await expect(page.locator(".guided-workflow__rail")).toHaveCount(0);
    await expectPanelsUseFullLane(page, `${width}px initial`);
    await expect(page.getByRole("button", { name: /start guided selections/i })).toHaveCount(0);
    await expect(page.getByLabel(/describe the task/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /continue/i })).toHaveCount(0);
    await expect(page.locator("#guided-finder-question")).toHaveText(/who are you/i);
    await expect(page.locator("#guided-finder-status")).not.toContainText(/matching SOP/i);
    await expect(page.locator(".guided-workflow__policy-note")).toBeVisible();
    await expect(page.getByRole("button", { name: /^back$/i })).toBeHidden();
    await expect(page.locator("#guided-finder-restart")).toBeHidden();

    if (width <= 920) {
      const menu = page.locator("[data-nav-toggle]");
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    }

    await expectNoOverflow(page, `${width}px question`);
    await expectChoiceLabelsWrapByWords(page, `${width}px department choices`);
    await page.getByRole("button", { name: /instructional technology/i }).first().click();
    await expect(page.locator("#guided-finder-question")).toHaveText(/what do you need/i);
    await expect(page.getByRole("button", { name: /^back$/i })).toBeVisible();
    await expect(page.locator("#guided-finder-restart")).toBeVisible();
    await expectNeedOptionsAreApprovedOnly(page);
    await expectChoiceLabelsWrapByWords(page, `${width}px need choices`);
    await expectChoiceGridIsHorizontalWhenRoomy(page, width);
    await expectChoiceTextFitsCards(page, `${width}px need choices`);
    await page.getByRole("button", { name: /troubleshoot/i }).first().click();
    await expectNoOverflow(page, `${width}px results`);
    await expectPanelsUseFullLane(page, `${width}px results`);
    await expect(page.getByRole("heading", { name: /best matching sop/i })).toBeVisible();
    await expectResultsUseReadableColumns(page, `${width}px`);
  });
}
