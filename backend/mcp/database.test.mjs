import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("migration scopes revision reads to the signed-in workspace agent", async () => {
  const db = new PGlite();
  const [workspace, otherWorkspace, a, b, outsider, record, agentA, agentB] =
    Array.from({ length: 8 }, () => randomUUID());
  try {
    // Reproduce the Auth role boundary locally. JWT verification belongs to Supabase.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
    `);
    await db.exec(await readFile(new URL("../../supabase/migrations/0001_read_record.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users values ($1), ($2), ($3)", [a, b, outsider]);
    await db.query("insert into workspaces(id,name) values ($1,'Demo'),($2,'Other')", [workspace, otherWorkspace]);
    await db.query("insert into workspace_members values ($1,$2),($1,$3),($4,$5)", [workspace,a,b,otherWorkspace,outsider]);
    await db.query("insert into agents(id,workspace_id,user_id,name) values ($1,$2,$3,'Planner'),($4,$2,$5,'Reviewer'),(gen_random_uuid(),$6,$7,'Other')",
      [agentA,workspace,a,agentB,b,otherWorkspace,outsider]);
    await db.query("insert into records values ($1,$2,'Fictional requirement')", [record,workspace]);
    await db.query("insert into record_revisions(record_id,revision,body) values ($1,1,'Budget 100'),($1,2,'Budget 80')", [record]);
    await db.exec("set role authenticated");
    for (const [subject, expectedAgent] of [[a,agentA],[b,agentB],[outsider,null]]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [subject]);
      const { rows: [row] } = await db.query("select public.read_record($1) as result", [record]);
      if (expectedAgent) {
        assert.equal(row.result.agentId, expectedAgent);
        assert.equal(row.result.revision, 2);
        assert.equal(row.result.body, "Budget 80");
      } else {
        assert.equal(row.result, null);
        assert.equal((await db.query("select * from record_revisions")).rows.length, 0);
      }
    }
    await assert.rejects(db.exec("update record_revisions set body='changed'"), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select public.read_record($1)", [record]), /permission denied/);
  } finally {
    await db.close();
  }
});
