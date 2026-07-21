import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "sop-hub-integration-"));

class PreparedStatement {
  constructor(database, query, bindings = []) {
    this.database = database;
    this.query = query;
    this.bindings = bindings;
  }
  bind(...bindings) { return new PreparedStatement(this.database, this.query, bindings); }
  async first() { return this.database.prepare(this.query).get(...this.bindings) || null; }
  async all() { return { results: this.database.prepare(this.query).all(...this.bindings) }; }
  executeRun() { return this.database.prepare(this.query).run(...this.bindings); }
  async run() { return this.executeRun(); }
}

class D1TestDatabase {
  constructor(database) { this.database = database; }
  prepare(query) { return new PreparedStatement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.executeRun());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function bundleModule(entry, name) {
  const outfile = join(temp, `${name}.mjs`);
  await build({ entryPoints: [resolve(root, entry)], outfile, bundle: true, platform: "node", format: "esm", target: "node24", logLevel: "silent" });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

async function applyMigrations(database) {
  const directory = resolve(root, "migrations");
  const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const migration of migrations) {
    if (migration.startsWith("0004_")) database.exec(await readFile(resolve(root, "seeds/0001_core_data.sql"), "utf8"));
    try { database.exec(await readFile(join(directory, migration), "utf8")); }
    catch (error) { throw new Error(`Migration ${migration} failed: ${error.message}`, { cause: error }); }
  }
}

function contextFor(database, path, { method = "GET", body, headers = {}, id } = {}) {
  return {
    request: new Request(`http://localhost${path}`, {
      method,
      headers: {
        "x-sop-dev-role": "creator",
        "x-sop-sub-role": "subrole-instructional-technology-specialist",
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env: { DB: database },
    params: id ? { id } : {},
  };
}

try {
  const sqlite = new DatabaseSync(":memory:");
  await applyMigrations(sqlite);
  const db = new D1TestDatabase(sqlite);
  sqlite.exec(`
    INSERT OR IGNORE INTO users (id,name,email,access_level,status,is_active)
      VALUES ('maya-patel','Maya Patel','maya@example.org','Creator / Reviewer','Active',1),
             ('victim-user','Victim User','victim@example.org','Creator / Reviewer','Active',1);
    INSERT OR IGNORE INTO user_sub_roles (user_id,sub_role_id)
      VALUES ('maya-patel','subrole-instructional-technology-specialist');
    INSERT OR IGNORE INTO categories (id,name,slug) VALUES ('cat-test','Technology','technology');
    INSERT INTO sops (
      id,title,slug,purpose,summary,category_id,status,type,current_version_id,is_active,
      owner_sub_role_id,created_by_user_id,archive_previous_status,archived_by_user_id,archive_reason,archived_at
    ) VALUES (
      'sop-archived-test','Archived integration SOP','archived-integration-sop','Purpose','Summary','cat-test',
      'Archived','Process','version-archived-test',0,'subrole-instructional-technology-specialist','maya-patel',
      'Published','maya-patel','Retired for integration testing','2026-07-20T12:00:00.000Z'
    );
    INSERT INTO sop_versions (
      id,sop_id,version_label,version_number,title,summary,purpose,body_markdown,content,status,
      created_by_user_id,created_by,created_at,updated_at,published_at
    ) VALUES (
      'version-archived-test','sop-archived-test','1.0','1.0','Archived integration SOP','Summary','Purpose',
      'Published body','Published body','Archived','maya-patel','maya-patel','2026-07-01T00:00:00Z',1782864000,1782864000
    );
    INSERT INTO procedure_steps (id,sop_version_id,step_number,title,instructions,note)
      VALUES ('step-archived-test','version-archived-test',1,'First step','Do the archived thing','Historical note');
    INSERT INTO media_assets (id,asset_type,original_file_name,mime_type,object_key,public_url,status,caption_url,transcript)
      VALUES ('media-archived-test','Video','walkthrough.mp4','video/mp4','test/walkthrough.mp4','/media/walkthrough.mp4','Active','/media/walkthrough.vtt','Transcript text');
    INSERT INTO sop_version_media (sop_version_id,media_asset_id,relationship,sort_order)
      VALUES ('version-archived-test','media-archived-test','Reference',1);
    INSERT INTO procedure_step_media (procedure_step_id,media_asset_id,relationship,sort_order)
      VALUES ('step-archived-test','media-archived-test','Instructional Media',1);
  `);

  const restore = await bundleModule("functions/api/sops/[id]/restore-as-draft.ts", "restore");
  const firstRestore = await restore.onRequestPost(contextFor(db, "/api/sops/sop-archived-test/restore-as-draft", {
    method: "POST", id: "sop-archived-test", body: { notes: "Restore as a separate draft version." },
  }));
  assert.equal(firstRestore.status, 200);
  const restoredPayload = await firstRestore.json();
  const draftVersionId = restoredPayload.data.versionId;
  assert.notEqual(draftVersionId, "version-archived-test");
  const restoredSop = sqlite.prepare("SELECT status,current_version_id AS versionId FROM sops WHERE id=?").get("sop-archived-test");
  assert.equal(restoredSop.status, "Draft");
  assert.equal(restoredSop.versionId, draftVersionId);
  assert.equal(sqlite.prepare("SELECT status FROM sop_versions WHERE id=?").get("version-archived-test").status, "Archived");
  assert.equal(sqlite.prepare("SELECT status FROM sop_versions WHERE id=?").get(draftVersionId).status, "Draft");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM procedure_steps WHERE sop_version_id=?").get(draftVersionId).total, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM sop_version_media WHERE sop_version_id=?").get(draftVersionId).total, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM procedure_step_media media JOIN procedure_steps steps ON steps.id=media.procedure_step_id WHERE steps.sop_version_id=?").get(draftVersionId).total, 1);

  const secondRestore = await restore.onRequestPost(contextFor(db, "/api/sops/sop-archived-test/restore-as-draft", {
    method: "POST", id: "sop-archived-test", body: { notes: "Duplicate restore" },
  }));
  assert.equal(secondRestore.status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM sop_versions WHERE sop_id=?").get("sop-archived-test").total, 2);

  sqlite.exec(`
    INSERT INTO sops (id,title,slug,purpose,summary,category_id,status,type,current_version_id,is_active,owner_sub_role_id,created_by_user_id)
      VALUES ('sop-archive-actor','Actor test','actor-test','Purpose','Summary','cat-test','Draft','Process','version-actor',1,'subrole-instructional-technology-specialist','maya-patel');
    INSERT INTO sop_versions (id,sop_id,version_label,version_number,title,summary,purpose,body_markdown,content,status,created_by_user_id,created_by,created_at,updated_at)
      VALUES ('version-actor','sop-archive-actor','0.1','0.1','Actor test','Summary','Purpose','Body','Body','Draft','maya-patel','maya-patel',CURRENT_TIMESTAMP,1782864000);
  `);
  const archive = await bundleModule("functions/api/sops/[id]/archive.ts", "archive");
  const archiveResponse = await archive.onRequestPost(contextFor(db, "/api/sops/sop-archive-actor/archive", {
    method: "POST", id: "sop-archive-actor", body: { reason: "No longer current", actorUserId: "victim-user" },
  }));
  assert.equal(archiveResponse.status, 200);
  assert.equal(sqlite.prepare("SELECT archived_by_user_id AS actor FROM sops WHERE id=?").get("sop-archive-actor").actor, "maya-patel");

  sqlite.exec(`
    INSERT INTO sops (
      id,title,slug,purpose,summary,category_id,status,type,is_active,owner_sub_role_id,
      created_by_user_id,archive_previous_status,archived_by_user_id,archive_reason,archived_at
    ) VALUES (
      'sop-archive-page-2','Second archived SOP','second-archived-sop','Purpose','Summary','cat-test',
      'Archived','Process',0,'subrole-instructional-technology-specialist','maya-patel',
      'Draft','maya-patel','Archived to exercise cursor pagination','2026-07-19T12:00:00.000Z'
    );
  `);
  const archived = await bundleModule("functions/api/sops/archived.ts", "archived");
  const firstArchivePage = await archived.onRequestGet(contextFor(db, "/api/sops/archived?limit=1"));
  assert.equal(firstArchivePage.status, 200);
  const firstArchivePayload = await firstArchivePage.json();
  assert.equal(firstArchivePayload.data.count, 2);
  assert.equal(firstArchivePayload.data.archivedSops.length, 1);
  assert.ok(firstArchivePayload.data.nextCursor);
  const secondArchivePage = await archived.onRequestGet(contextFor(
    db,
    `/api/sops/archived?limit=1&cursor=${encodeURIComponent(firstArchivePayload.data.nextCursor)}`,
  ));
  assert.equal(secondArchivePage.status, 200);
  const secondArchivePayload = await secondArchivePage.json();
  assert.equal(secondArchivePayload.data.count, 2);
  assert.equal(secondArchivePayload.data.archivedSops.length, 1);
  assert.notEqual(secondArchivePayload.data.archivedSops[0].id, firstArchivePayload.data.archivedSops[0].id);
  const excessiveSearch = await archived.onRequestGet(contextFor(db, `/api/sops/archived?q=${"x".repeat(49)}`));
  assert.equal(excessiveSearch.status, 400);

  const unauthenticated = await archive.onRequestPost({
    request: new Request("https://example.pages.dev/api/sops/sop-archive-actor/archive?subRole=instructional-technology-specialist", {
      method: "POST", headers: { "content-type": "application/json", "x-sop-dev-role": "admin" }, body: JSON.stringify({ reason: "Unauthorized" }),
    }),
    env: { DB: db }, params: { id: "sop-archive-actor" },
  });
  assert.equal(unauthenticated.status, 401);

  const forgedEmailHeader = await archive.onRequestPost({
    request: new Request("https://example.pages.dev/api/sops/sop-archive-actor/archive", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-access-authenticated-user-email": "maya@example.org" },
      body: JSON.stringify({ reason: "Forged identity header" }),
    }),
    env: { DB: db }, params: { id: "sop-archive-actor" },
  });
  assert.equal(forgedEmailHeader.status, 401);

  const inventory = await bundleModule("functions/_shared/sop-inventory.ts", "inventory");
  const invalidDateCsv = "sop_id,title,summary,category,department,creator_reviewer_role,review_due_date\r\nsop-date-test,Date test,Summary,Technology,Instructional Technology,Instructional Technologist,2026-02-31";
  const invalidDate = await inventory.buildInventoryPreview(db, invalidDateCsv);
  assert.equal(invalidDate.summary.invalidRows, 1);
  assert.equal(invalidDate.rows[0].errors.some((error) => error.column === "review_due_date"), true);
  const optionalWorkflowCsv = "sop_id,title,summary,category,department,creator_reviewer_role\r\nsop-optional-test,Optional workflow fields,Summary,Technology,Instructional Technology,Instructional Technologist";
  const optionalWorkflow = await inventory.buildInventoryPreview(db, optionalWorkflowCsv);
  assert.equal(optionalWorkflow.summary.validRows, 1, JSON.stringify(optionalWorkflow.rows[0]?.errors || optionalWorkflow));
  assert.equal(optionalWorkflow.rows[0].payload.requestedStatus, "Draft");
  assert.equal(optionalWorkflow.rows[0].payload.versionNumber, "0.1");

  sqlite.exec(`
    INSERT INTO sops (id,title,slug,purpose,status,type,is_active,owner_sub_role_id,created_by_user_id)
      VALUES ('existing-slug-owner','Existing slug owner','collision-123456789012','Purpose','Draft','Process',1,'subrole-instructional-technology-specialist','maya-patel');
  `);
  const slugConflictCsv = "sop_id,title,summary,category,department,creator_reviewer_role\r\nsop-conflict-123456789012,Collision,Summary,Technology,Instructional Technology,Instructional Technologist";
  const slugConflict = await inventory.buildInventoryPreview(db, slugConflictCsv);
  assert.equal(slugConflict.summary.invalidRows, 1);
  assert.equal(slugConflict.rows[0].errors.some((error) => error.column === "title" && /slug/i.test(error.message)), true);

  assert.doesNotThrow(() => sqlite.exec("UPDATE sops SET restored_by_user_id='maya-patel' WHERE id='sop-archived-test'"));
  assert.throws(() => sqlite.exec("UPDATE sops SET restored_by_user_id='missing-user' WHERE id='sop-archived-test'"), /Invalid restored-by user/);
  assert.throws(
    () => sqlite.exec("UPDATE sops SET status='Archived', is_active=0, archive_reason=NULL WHERE id='sop-archived-test'"),
    /Archived SOP metadata is incomplete/,
  );
  console.log("Archive, authentication, migration, restore, and inventory integration checks passed.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
