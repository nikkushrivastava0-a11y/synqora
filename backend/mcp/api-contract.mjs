import { z } from "zod";

const id = z.string().uuid();
const count = z.number().int().nonnegative();
const revision = z.number().int().positive();
const text = z.string().trim().min(1);
const source = z.object({ recordId: id, revision });
const status = z.enum(["open", "claimed", "needs_review", "completed"]);
const record = z.object({ id, workspaceId: id, title: text, body: z.string(), revision });
const task = z.object({ id, title: text, status, ownerAgentId: id.nullable(), sources: z.array(source) });
const approval = z.object({ id, conflictId: id, state: z.enum(["pending", "approved", "rejected"]),
  decidedBy: id.nullable(), reason: text.nullable(), sources: z.array(source) });
export const request = {
  createRecord: z.object({ operationId: id, title: text, body: text }).strict(),
  reviseRecord: z.object({ operationId: id, expectedRevision: revision, body: text, reason: text }).strict(),
  resolveConflict: z.object({ operationId: id, correctedResultId: id, reason: text }).strict(),
  decideApproval: z.object({ operationId: id, decision: z.enum(["approve", "reject"]), reason: text }).strict(),
};
export const data = {
  overview: z.object({ workspaceId: id, name: text, taskCount: count, pendingApprovals: count }),
  agents: z.array(z.object({ id, name: text })),
  records: z.array(record), createRecord: record, reviseRecord: record,
  tasks: z.array(task),
  impact: z.array(z.object({ source, taskId: id, path: z.array(id).min(1) })),
  conflicts: z.array(z.object({ id, taskId: id, proposedResultId: id, used: z.array(source),
    current: z.array(source), state: z.enum(["open", "resolved"]) })),
  resolveConflict: approval, approvals: z.array(approval), decideApproval: approval,
  events: z.array(z.object({ id, at: z.string().datetime(), action: text, agentId: id.nullable(),
    userId: id.nullable(), operationId: id.nullable(), sources: z.array(source) })),
  benchmarks: z.array(z.object({ metric: text, value: z.number().nullable(), unit: text, evidenceEventIds: z.array(id) })),
};
export function envelope(schema) {
  return z.discriminatedUnion("success", [
    z.object({ success: z.literal(true), data: schema }),
    z.object({ success: z.literal(false), error: z.object({ code: text, message: text }) }),
  ]);
}

