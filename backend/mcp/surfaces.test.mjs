import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { data, envelope } from "./api-contract.ts";
import { id, workspace, requirement, inputs } from "./campus.mjs";

test(
  "13 HTTP contracts and eight MCP tools share local database state",
  { timeout: 40000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "campus-http-"));
    const api = spawn(process.execPath, ["local-api.mjs"], {
      env: { ...process.env, PORT: "0", SYNQORA_STATE_DIR: dir },
      stdio: ["ignore", "pipe", "inherit"],
    });
    const clients = [];
    try {
      const [msg] = await once(api.stdout, "data");
      const port = String(msg).match(/port (\d+)/)[1];
      const file = join(dir, "sessions.json");
      const sessions = JSON.parse(await readFile(file, "utf8"));
      const http = async (path, key, body) => {
        const response = await fetch(
          "http://127.0.0.1:" + port + "/api/" + path,
          {
            method: body ? "POST" : "GET",
            headers: {
              Authorization: "Bearer " + sessions.human,
              "Content-Type": "application/json",
            },
            body: body && JSON.stringify(body),
          },
        );
        const payload = envelope(data[key]).parse(await response.json());
        assert.equal(payload.success, true, JSON.stringify(payload));
        return payload.data;
      };
      const client = async (role) => {
        const c = new Client({ name: "protocol-test-" + role, version: "1" });
        await c.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: ["local-mcp.mjs"],
            env: { PORT: port, SYNQORA_SESSIONS: file, SYNQORA_AGENT: role },
          }),
        );
        clients.push(c);
        assert.deepEqual(
          (await c.listTools()).tools.map((t) => t.name).sort(),
          Object.keys(inputs).sort(),
        );
        return async (name, args) => {
          const r = await c.callTool({ name, arguments: args });
          assert.ok(!r.isError, JSON.stringify(r));
          return JSON.parse(r.content[0].text).data;
        };
      };
      const a = await client("planner");
      const firstTask = id(11);
      const op = () => randomUUID();
      await a("read_record", { recordId: requirement });
      await a("list_tasks", { workspaceId: workspace });
      await a("claim_task", { operationId: op(), taskId: firstTask });
      const plan = await a("submit_result", {
        operationId: op(),
        taskId: firstTask,
        body: "Plan: validate fullName",
        sources: await a("get_sources", { taskId: firstTask }),
      });
      const b = await client("reviewer");
      assert.equal(
        (await b("read_record", { recordId: plan.resultId })).body,
        "Plan: validate fullName",
      );
      const taskId = id(10);
      const claim = op();
      await b("claim_task", { operationId: claim, taskId });
      assert.equal((await b("resume_task", { operationId: claim })).id, taskId);
      const base = "workspaces/" + workspace + "/";
      await http(base + "records", "createRecord", {
        operationId: op(),
        title: "Reviewer notes",
        body: "Plan retrieved",
      });
      await http("records/" + requirement + "/revisions", "reviseRecord", {
        expectedRevision: 1,
        body: "Use displayName",
        reason: "Approved rename",
        operationId: op(),
      });
      assert.equal(
        (await b("check_revision", { recordId: requirement, revision: 1 }))
          .current,
        false,
      );
      const submit = (revision, body) =>
        b("submit_result", {
          operationId: op(),
          taskId,
          body,
          sources: [{ recordId: requirement, revision }],
        });
      const stale = await submit(1, "Review using fullName");
      const fix = await submit(2, "Reviewed displayName");
      const approval = await http(
        "conflicts/" + stale.conflictId + "/resolve",
        "resolveConflict",
        {
          operationId: op(),
          correctedResultId: fix.resultId,
          reason: "Review correction",
        },
      );
      await http("approvals/" + approval.id + "/decision", "decideApproval", {
        operationId: op(),
        decision: "approve",
        reason: "Source checked",
      });
      assert.equal(
        (await b("get_task_context", { taskId })).status,
        "completed",
      );
      for (const key of [
        "overview",
        "agents",
        "records",
        "tasks",
        "impact",
        "conflicts",
        "approvals",
        "events",
        "benchmarks",
      ])
        await http(base + key, key);
    } finally {
      for (const c of clients) await c.close();
      const exited = once(api, "exit");
      api.kill();
      await exited;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
