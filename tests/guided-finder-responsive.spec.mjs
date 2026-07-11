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
        options: [
          { value: "Troubleshoot a very long Brightspace course-copy and section-sync problem", label: "Troubleshoot a very long Brightspace course-copy and section-sync problem", hint: "Derived from live SOP taxonomy with long wrapping text" },
          { value: "Complete a process", label: "Complete a process", hint: "Derived from live SOP taxonomy" },
        ],
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
        const body = req.method === "POST" ? apiPost : apiGet;
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

for (const width of widths) {
  test(`Guided Finder reflows without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 740 : 900 });
    await page.addInitScript(() => {
      localStorage.setItem("sopHubSelectedRole", "normal");
      localStorage.removeItem("sopHubSelectedCreatorSubRole");
    });
    await page.goto(`${baseUrl}/guided-finder/`, { waitUntil: "networkidle" });
    await expectNoOverflow(page, `${width}px initial`);

    if (width <= 920) {
      const menu = page.locator("[data-nav-toggle]");
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    }

    await page.getByRole("button", { name: /start guided selections/i }).click();
    await expectNoOverflow(page, `${width}px question`);
    await page.getByRole("button", { name: /instructional technology/i }).first().click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /troubleshoot/i }).first().click();
    await expectNoOverflow(page, `${width}px results`);
    await expect(page.getByRole("heading", { name: /best matching sop/i })).toBeVisible();
  });
}
