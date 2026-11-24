import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { openCampus, operate, id, workspace, requirement } from "./campus.mjs";
test("CampusFest impact, concurrent stale submit, human correction and scoped replay", async () => {
  const db = await openCampus();
  const human = id(3),
    agent = id(4),
    tid = id(10);
  const call = (actor, op, target, input) =>
    operate(db, actor, op, target, input);
  const mutation = (fields) => ({ operationId: randomUUID(), ...fields });
  const source = (revision) => [{ recordId: requirement, revision }];
  try {
    await db.query(
      "insert into task_dependencies values ($1,$2) on conflict do nothing",
      [tid, id(12)],
    );
    await db.query("insert into task_dependencies values ($1,$2)", [
      id(12),
      tid,
    ]);
    await call(agent, "claim_task", tid, mutation({ taskId: tid }));
    const [record, result] = await Promise.all([
      call(
        human,
        "reviseRecord",
        requirement,
        mutation({
          expectedRevision: 1,
          body: "Register using displayName",
          reason: "Field rename",
        }),
      ),
      call(
        agent,
        "submit_result",
        tid,
        mutation({ taskId: tid, body: "Old form", sources: source(1) }),
      ),
    ]);
    assert.equal(record.revision, 2);
    assert.equal(result.state, "stale");
    const impact = await call(human, "impact", workspace);
    assert.equal(impact.length, 3);
    assert.deepEqual(impact.find((r) => r.taskId === id(12)).path, [
      tid,
      id(12),
    ]);
    const tasks = await call(agent, "list_tasks", workspace, {
      workspaceId: workspace,
    });
    assert.deepEqual(
      tasks.map((t) => t.status),
      [
        "needs_review",
        "needs_review",
        "needs_review",
        "completed",
        "completed",
      ],
    );
    const corrected = await call(
      agent,
      "submit_result",
      tid,
      mutation({ taskId: tid, body: "Use displayName", sources: source(2) }),
    );
    const proposal = mutation({
      correctedResultId: corrected.resultId,
      reason: "Uses revision 2",
    });
    const approval = await call(
      human,
      "resolveConflict",
      result.conflictId,
      proposal,
    );
    const decision = mutation({
      decision: "approve",
      reason: "Confirmed field against API revision 2",
    });
    await assert.rejects(
      call(agent, "decideApproval", approval.id, decision),
      (e) => e.status === 403,
    );
    const accepted = await call(human, "decideApproval", approval.id, decision);
    assert.equal(accepted.state, "approved");
    assert.deepEqual(
      await call(human, "decideApproval", approval.id, decision),
      accepted,
    );
    await assert.rejects(
      call(human, "decideApproval", approval.id, {
        ...decision,
        reason: "Changed",
      }),
      (e) => e.status === 409,
    );
    await assert.rejects(
      call(id(5), "resume_task", null, { operationId: decision.operationId }),
      (e) => e.status === 404,
    );
    await db.query(
      "insert into campus_users values ($1,$2,'Outside','agent')",
      [id(90), id(91)],
    );
    await assert.rejects(
      call(id(90), "get_task_context", tid, { taskId: tid }),
      (e) => e.status === 404,
    );
    const history = await call(agent, "get_task_context", tid, { taskId: tid });
    assert.deepEqual(
      history.results.map((x) => x.state),
      ["stale", "accepted"],
    );
    assert.equal(
      (await call(human, "events", workspace)).filter(
        (x) => x.operationId === decision.operationId,
      ).length,
      1,
    );
  } finally {
    await db.close();
  }
});
