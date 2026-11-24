import assert from "node:assert/strict";
import { test } from "node:test";
import { client } from "../src/api";
import { mockTransport, fixtureCorrection } from "../src/mock";
import { uid } from "../src/fixture";
test("revision → impact → stale result → cited approval → idempotent replay", async () => {
  const api = client(uid(1), mockTransport());
  const start = await api.load();
  const r = start.records[0];
  const edit = {
    operationId: uid(101),
    expectedRevision: r.revision,
    body: "Registration expects displayName.",
    reason: "Rename field",
  };
  await api.write("reviseRecord", r.id, edit);
  await api.write("reviseRecord", r.id, edit);
  await assert.rejects(
    () => api.write("reviseRecord", r.id, { ...edit, body: "Different" }),
    /conflict/i,
  );
  const changed = await api.load();
  assert.equal(
    changed.tasks.filter((t) => t.status === "needs_review").length,
    3,
  );
  assert.deepEqual(changed.tasks.slice(3), start.tasks.slice(3));
  assert.deepEqual(changed.impact.at(-1)?.path, [uid(20), uid(22)]);
  const c = changed.conflicts[0];
  assert.equal(c.used[0].revision, 1);
  assert.equal(c.current[0].revision, 2);
  const a = await api.write("resolveConflict", c.id, {
    operationId: uid(102),
    correctedResultId: fixtureCorrection,
    reason: "Use displayName",
  });
  assert.equal(a.state, "pending");
  const approve = {
    operationId: uid(103),
    decision: "approve" as const,
    reason: "Checked revision 2",
  };
  const decision = await api.write("decideApproval", a.id, approve);
  const before = await api.load();
  assert.deepEqual(await api.write("decideApproval", a.id, approve), decision);
  assert.deepEqual(await api.load(), before);
  assert.equal(decision.decidedBy, uid(6));
  assert.deepEqual(
    before.benchmarks.map((b) => b.value),
    [1, 1, 1],
  );
  assert.equal(
    before.events.filter((e) => e.operationId === approve.operationId).length,
    1,
  );
});
test("invalid response and denied access remain distinct from an empty workspace", async () => {
  await assert.rejects(
    client(uid(1), async () =>
      Response.json({ success: true, data: {} }),
    ).load(),
    /schema/,
  );
  await assert.rejects(
    client(uid(1), async () => new Response("", { status: 403 })).load(),
    /Permission denied/,
  );
});
