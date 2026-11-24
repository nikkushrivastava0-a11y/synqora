import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { id, requirement, workspace } from "./campus.mjs";

test(
  "caller dies after committed result and before acknowledgement",
  { timeout: 40000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "synqora-retry-"));
    const api = spawn(process.execPath, ["local-api.mjs"], {
      env: { ...process.env, PORT: "0", SYNQORA_STATE_DIR: dir },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let proxy, caller;
    try {
      const [ready] = await Promise.race([
        once(api.stdout, "data"),
        once(api, "exit").then(() => {
          throw Error("API startup failed");
        }),
      ]);
      const port = String(ready).match(/port (\d+)/)[1];
      const sessions = JSON.parse(
        await readFile(join(dir, "sessions.json"), "utf8"),
      );
      const headers = {
        Authorization: "Bearer " + sessions.planner,
        "Content-Type": "application/json",
      };
      const base = "http://127.0.0.1:" + port;
      const post = async (name, input) =>
        fetch(base + "/mcp/" + name, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        });
      const taskId = id(11);
      assert.equal(
        (await post("claim_task", { taskId, operationId: randomUUID() }))
          .status,
        200,
      );
      const input = {
        taskId,
        operationId: randomUUID(),
        body: "Validator plan",
        sources: [{ recordId: requirement, revision: 1 }],
      };
      let notify;
      const committed = new Promise((resolve) => {
        notify = resolve;
      });
      proxy = createServer(async (req) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        const upstream = await post("submit_result", JSON.parse(body));
        notify(await upstream.json());
        // Deliberately withhold the response. The child remains blocked in fetch.
      });
      proxy.listen(0, "127.0.0.1");
      await once(proxy, "listening");
      caller = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "await fetch(process.argv[1],{method:'POST',body:process.argv[2]});process.exit(7)",
          "http://127.0.0.1:" + proxy.address().port,
          JSON.stringify(input),
        ],
        { stdio: "ignore" },
      );
      const first = await committed;
      assert.equal(first.data.state, "accepted");
      const exited = once(caller, "exit");
      caller.kill("SIGKILL");
      assert.equal((await exited)[1], "SIGKILL");
      const retry = await (await post("submit_result", input)).json();
      assert.deepEqual(retry.data, first.data);
      const resumed = await (
        await post("resume_task", { operationId: input.operationId })
      ).json();
      assert.deepEqual(resumed.data, first.data);
      assert.equal(
        (await post("submit_result", { ...input, body: "Different" })).status,
        409,
      );
      const context = await (await post("get_task_context", { taskId })).json();
      assert.equal(
        context.data.results.filter((r) => r.state === "accepted").length,
        1,
      );
      const events = await (
        await fetch(base + "/api/workspaces/" + workspace + "/events", {
          headers,
        })
      ).json();
      assert.equal(
        events.data.filter((e) => e.operationId === input.operationId).length,
        1,
      );
    } finally {
      caller?.kill();
      proxy?.closeAllConnections();
      proxy?.close();
      const stopped =
        api.exitCode === null && api.signalCode === null
          ? once(api, "exit")
          : null;
      api.kill();
      if (stopped) await stopped;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
