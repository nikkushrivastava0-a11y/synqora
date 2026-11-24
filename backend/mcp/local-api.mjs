import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { openCampus, operate, inputs, id, workspace } from "./campus.mjs";

import { reviewPlan, reviewInput } from "./gemini-reviewer.mjs";
let reviewing = false;

const dir = resolve(process.env.SYNQORA_STATE_DIR ?? ".synqora-local");
await mkdir(dir, { recursive: true, mode: 0o700 });
const credentials = join(dir, "sessions.json");
let sessions;
try {
  sessions = JSON.parse(await readFile(credentials, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  sessions = Object.fromEntries(
    ["human", "planner", "reviewer"].map((name) => [
      name,
      randomBytes(32).toString("hex"),
    ]),
  );
  await writeFile(credentials, JSON.stringify(sessions), {
    flag: "wx",
    mode: 0o600,
  });
}
const roles = ["human", "planner", "reviewer"];
if (!sessions || roles.some(role => typeof sessions[role] !== "string" || !/^[0-9a-f]{64}$/.test(sessions[role])) ||
    new Set(roles.map(role => sessions[role])).size !== roles.length) {
  throw Error("Invalid local sessions file. Demo state was preserved.");
}
const db = await openCampus(join(dir, "postgres"));
const identities = new Map(
  roles.map((name, i) => [
    sessions[name],
    id(3 + i),
  ]),
);
const workspaceRoutes = {
  overview: "overview",
  agents: "agents",
  records: "records",
  tasks: "list_tasks",
  impact: "impact",
  conflicts: "conflicts",
  approvals: "approvals",
  events: "events",
  benchmarks: "benchmarks",
};
const mutations = {
  "records/revisions": "reviseRecord",
  "conflicts/resolve": "resolveConflict",
  "approvals/decision": "decideApproval",
};
const error = (status, message) =>
  Object.assign(new Error(message), { status });
const server = createServer(async (req, res) => {
  try {
    const user = identities.get(
      req.headers.authorization?.replace(/^Bearer /, ""),
    );
    if (!user) throw error(401, "Sign in required");
    const [, prefix, group, target, action] = req.url.split("?")[0].split("/");
    let body = {};
    if (req.method === "POST") {
      let size = 0;
      const parts = [];
      for await (const part of req) {
        size += part.length;
        if (size > 65536) throw error(413, "Request too large");
        parts.push(part);
      }
      try {
        body = JSON.parse(Buffer.concat(parts).toString());
      } catch {
        throw error(400, "Invalid JSON");
      }
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw error(400, "Expected a JSON object");
    if (prefix === "api" && group === "workspaces" && target === workspace && action === "review" && req.method === "POST") {
      if (user !== id(3)) throw error(403, "Human operator required");
      const input = reviewInput.parse(body);
      if (reviewing) throw error(409, "Reviewer already running");
      reviewing = true;
      try {
        const data = await reviewPlan({input, call: (op, args) => operate(db, id(5), op, args.workspaceId ?? args.taskId ?? args.recordId ?? null, args)});
        res.writeHead(200, {"Content-Type":"application/json", "Cache-Control":"no-store"});
        res.end(JSON.stringify({success:true,data}));
      } finally { reviewing = false; }
      return;
    }
    let op,
      scope = target;
    if (
      prefix === "mcp" &&
      req.method === "POST" &&
      Object.hasOwn(inputs, group)
    ) {
      op = group;
      scope = body.workspaceId ?? body.taskId ?? body.recordId ?? null;
    } else if (
      prefix === "api" &&
      group === "workspaces" &&
      Object.hasOwn(workspaceRoutes, action)
    ) {
      if (req.method === "GET") {
        op = workspaceRoutes[action];
        if (op === "list_tasks") body = { workspaceId: target };
      } else if (req.method === "POST" && action === "records")
        op = "createRecord";
    } else if (prefix === "api" && req.method === "POST")
      op = mutations[group + "/" + action];
    if (!op) throw error(404, "Route unavailable");
    const data = await operate(db, user, op, scope, body);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ success: true, data }));
  } catch (e) {
    const status =
      e.name === "ZodError" || e.code === "22P02" ? 400 : (e.status ?? 500);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code:
            {
              400: "INVALID_INPUT",
              401: "UNAUTHENTICATED",
              403: "FORBIDDEN",
              404: "NOT_FOUND",
              409: "CONFLICT",
            }[status] ?? "REQUEST_FAILED",
          message:
            status === 500
              ? "Database request failed"
              : e.name === "ZodError"
                ? "Invalid request"
                : e.message,
        },
      }),
    );
  }
});
server.listen(Number(process.env.PORT ?? 4317), "127.0.0.1", () =>
  console.log(
    "CampusFest listening on loopback port",
    server.address().port,
    "workspace",
    workspace,
  ),
);
