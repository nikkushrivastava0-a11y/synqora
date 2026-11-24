import { campusFest, uid } from "./fixture";
import { request } from "./contract";
import type { ReadKey, Transport, Workspace, WriteKey } from "./api";

export const fixtureCorrection = uid(60);
export function mockTransport(): Transport {
  const s = campusFest();
  const history = new Map<string, { signature: string; result: unknown }>();
  const ok = (data: unknown) => Response.json({ success: true, data });
  const fail = (status: number, message: string) =>
    Response.json(
      { success: false, error: { code: "MOCK_" + status, message } },
      { status },
    );
  function event(
    action: string,
    operationId: string,
    sources: Workspace["events"][number]["sources"],
    human = false,
  ) {
    const e = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action,
      agentId: human ? null : uid(3),
      userId: human ? uid(6) : null,
      operationId,
      sources,
    };
    s.events.push(e);
    return e.id;
  }
  return async (path, init) => {
    const parts = path.split("/"),
      [, prefix, resource, id, action] = parts;
    if (
      prefix !== "api" ||
      parts.length !== 5 ||
      (resource === "workspaces" && id !== s.overview.workspaceId)
    )
      return fail(404, "Unknown route");
    if (!init?.method || init.method === "GET")
      return resource === "workspaces" && Object.hasOwn(s, action)
        ? ok(s[action as ReadKey])
        : fail(404, "Missing resource");
    const key: WriteKey | undefined =
      resource === "workspaces" && action === "records"
        ? "createRecord"
        : resource === "records" && action === "revisions"
          ? "reviseRecord"
          : resource === "conflicts" && action === "resolve"
            ? "resolveConflict"
            : resource === "approvals" && action === "decision"
              ? "decideApproval"
              : undefined;
    if (init.method !== "POST" || !key) return fail(404, "Unknown route");
    const raw = JSON.parse(String(init.body));
    if (!request[key].safeParse(raw).success)
      return fail(400, "Invalid request");
    const op = raw.operationId as string,
      sig = JSON.stringify([path, raw]),
      prior = history.get(op);
    if (prior)
      return prior.signature === sig
        ? ok(prior.result)
        : fail(409, "Payload changed");
    let result: unknown;
    if (key === "createRecord") {
      const row = {
        id: crypto.randomUUID(),
        workspaceId: id,
        title: raw.title,
        body: raw.body,
        revision: 1,
      };
      s.records.push(row);
      result = row;
      event("Record created", op, [{ recordId: row.id, revision: 1 }], true);
    } else if (key === "reviseRecord") {
      const record = s.records.find((r) => r.id === id);
      if (!record) return fail(404, "Unknown record");
      if (record.revision !== raw.expectedRevision)
        return fail(409, "Stale revision");
      const old = record.revision++;
      record.body = raw.body;
      result = record;
      const source = { recordId: id, revision: record.revision };
      const affected = s.tasks.filter((t) =>
        t.sources.some((c) => c.recordId === id),
      );
      s.impact = [
        ...s.impact.filter((x) => x.source.recordId !== id),
        ...affected.map((t) => ({
          source,
          taskId: t.id,
          path: t.id === uid(22) ? [uid(20), t.id] : [t.id],
        })),
      ];
      affected.forEach((t) => {
        t.status = "needs_review";
      });
      event("Requirement revised", op, [source], true);
      if (affected.length) {
        if (!s.records.some((r) => r.id === fixtureCorrection))
          s.records.push({
            id: fixtureCorrection,
            workspaceId: s.overview.workspaceId,
            title: "Corrected registration form result",
            body: "Uses the revised registration field.",
            revision: 1,
          });
        s.conflicts.push({
          id: crypto.randomUUID(),
          taskId: affected[0].id,
          proposedResultId: uid(61),
          used: [{ recordId: id, revision: old }],
          current: [source],
          state: "open",
        });
        event("Stale submission detected", op, [
          { recordId: id, revision: old },
          source,
        ]);
      }
    } else if (key === "resolveConflict") {
      const c = s.conflicts.find((c) => c.id === id);
      if (!c) return fail(404, "Unknown conflict");
      if (raw.correctedResultId !== fixtureCorrection)
        return fail(404, "Unknown result");
      if (
        c.state === "resolved" ||
        s.approvals.some((a) => a.conflictId === id && a.state === "pending")
      )
        return fail(409, "Already proposed");
      const a: Workspace["approvals"][number] = {
        id: crypto.randomUUID(),
        conflictId: id,
        state: "pending",
        decidedBy: null,
        reason: null,
        sources: c.current,
      };
      s.approvals.push(a);
      result = a;
      event("Correction proposed", op, c.current);
    } else {
      const a = s.approvals.find((a) => a.id === id);
      if (!a) return fail(404, "Unknown approval");
      if (a.state !== "pending") return fail(409, "Already decided");
      const c = s.conflicts.find((c) => c.id === a.conflictId)!;
      if (
        a.sources.some(
          (x) =>
            s.records.find((r) => r.id === x.recordId)?.revision !== x.revision,
        )
      )
        return fail(409, "Stale correction");
      const approved = raw.decision === "approve";
      a.state = approved ? "approved" : "rejected";
      a.reason = raw.reason;
      a.decidedBy = uid(6);
      result = a;
      const evidence = event(
        approved ? "Correction approved" : "Correction rejected",
        op,
        a.sources,
        true,
      );
      if (approved) {
        c.state = "resolved";
        const task = s.tasks.find((t) => t.id === c.taskId)!;
        task.status = "completed";
        task.sources = a.sources;
        s.benchmarks = [
          "Distinct corrected results",
          "Accepted updates",
          "Decision audit events",
        ].map((metric, i) => ({
          metric,
          value: [
            new Set([fixtureCorrection]).size,
            s.approvals.filter((x) => x.id === a.id && x.state === "approved")
              .length,
            s.events.filter((x) => x.operationId === op).length,
          ][i],
          unit: "count",
          evidenceEventIds: [evidence],
        }));
      }
    }
    s.overview.pendingApprovals = s.approvals.filter(
      (a) => a.state === "pending",
    ).length;
    history.set(op, { signature: sig, result: structuredClone(result) });
    return ok(result);
  };
}
