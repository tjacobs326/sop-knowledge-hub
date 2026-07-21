import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { test, expect } from "@playwright/test";

const distDir = normalize(join(process.cwd(), "dist"));
const contentTypes = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".svg", "image/svg+xml"]]);
let server;
let baseUrl;
let restored = false;

const archiveRecord = (id, title) => ({
  id, title, categoryId: "cat-tech", category: "Technology", ownerId: "maya-patel", owner: "Maya Patel",
  previousStatus: "Published", archivedAt: "2026-07-20T12:00:00Z", archivedBy: "Maya Patel",
  archiveReason: "Replaced by current guidance", updatedAt: "2026-07-20T12:00:00Z",
});

async function serveFile(pathname) {
  const safePath = pathname.replace(/^\/+/, "").replace(/\.\./g, "");
  const filePath = join(distDir, safePath.endsWith("/") ? `${safePath}index.html` : safePath || "index.html");
  return readFile(filePath).catch(() => Buffer.from(""));
}

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/sops/archived") {
      const secondPage = Boolean(url.searchParams.get("cursor"));
      const records = restored ? [] : secondPage ? [archiveRecord("sop-2", "Second archived SOP")] : [archiveRecord("sop-1", "Archived SOP with a long responsive title")];
      const body = { success: true, data: {
        context: { workScopeLabel: "My Work - Instructional Technology" }, capabilities: { canRestoreAsDraft: true },
        count: restored ? 0 : 2, archivedSops: records, nextCursor: !restored && !secondPage ? "next-page" : "",
        filters: { departments: ["Instructional Technology"], categories: [{ id: "cat-tech", label: "Technology" }], owners: [{ id: "maya-patel", label: "Maya Patel" }] },
      } };
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); return;
    }
    if (url.pathname.endsWith("/restore-as-draft") && req.method === "POST") {
      restored = true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { editUrl: "/create/?edit=draft&id=sop-1&origin=my-drafts" } })); return;
    }
    if (url.pathname === "/api/admin/sop-inventory" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ history: [{ actionType: "Import", adminUser: "Tarek", fileName: "inventory.csv", createdAt: "2026-07-20T12:00:00Z", totalRows: 1, createdRecords: 1, updatedRecords: 0, skippedRecords: 0, status: "Completed" }] })); return;
    }
    if (url.pathname === "/api/admin/sop-inventory" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ preview: { summary: { totalRows: 1, validRows: 1, invalidRows: 0, newRecords: 1, existingRecords: 0, duplicateRows: 0 }, rows: [{ rowNumber: 2, sopId: "sop-new", title: "New SOP", valid: true, action: "Create", errors: [], warnings: [] }] } })); return;
    }
    const file = await serveFile(url.pathname);
    res.writeHead(200, { "content-type": contentTypes.get(extname(url.pathname)) || "text/html; charset=utf-8" }); res.end(file);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Archived SOP workflow preserves scope and reflows on mobile", async ({ page }) => {
  restored = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem("sopHubSelectedRole", "creator"); localStorage.setItem("sopHubSelectedCreatorSubRole", "subrole-instructional-technology-specialist"); });
  await page.goto(`${baseUrl}/my-work/archived/?scope=mine&subRole=instructional-technologist`, { waitUntil: "networkidle" });
  await expect(page.locator("#archived-context")).toContainText("1 of 2");
  await expect(page.locator("#archived-list tr").first()).toHaveCSS("display", "block");
  await expectNoPageOverflow(page);
  await page.getByLabel("Search archived SOPs").fill("retired guidance");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/q=retired\+guidance/);
  const viewHref = await page.getByRole("link", { name: "View" }).getAttribute("href");
  expect(viewHref).toContain("scope=mine");
  expect(viewHref).toContain("returnTo=");
  await page.getByRole("button", { name: "Load more archived SOPs" }).click();
  await expect(page.locator("#archived-list tr")).toHaveCount(2);
  await page.locator('[data-restore-id="sop-1"]').click();
  await page.locator("#confirm-restore").click();
  await expect(page.locator("#archived-confirmation")).toContainText("restored as a draft");
});

test("Inventory preview moves focus and uses mobile cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("sopHubSelectedRole", "admin"));
  await page.goto(`${baseUrl}/admin/sop-inventory/`, { waitUntil: "networkidle" });
  await page.locator("#inventory-file").setInputFiles({ name: "inventory.csv", mimeType: "text/csv", buffer: Buffer.from("sop_id,title\nsop-new,New SOP") });
  await page.getByRole("button", { name: "Validate and Preview" }).click();
  await expect(page.locator("#preview-section")).toBeVisible();
  await expect(page.locator("#preview-heading")).toBeFocused();
  await expect(page.locator("#preview-rows tr").first()).toHaveCSS("display", "block");
  await expect(page.locator("#history-rows tr").first()).toHaveCSS("display", "block");
  await expectNoPageOverflow(page);
});
