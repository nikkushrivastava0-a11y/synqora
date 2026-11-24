import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("stdio discovery and scoped record lookup through a fixture RPC", async () => {
  const record = {id: randomUUID(), workspaceId: randomUUID(), agentId: randomUUID(),
    title: "Fictional budget", revision: 2, body: "Budget 100"};
  let calls = 0;
  const api = createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, "/rest/v1/rpc/read_record");
    assert.equal(req.headers.authorization, "Bearer fixture");
    let body = "";
    for await (const chunk of req) body += chunk;
    res.end(JSON.stringify(JSON.parse(body).p_record_id === record.id ? record : null));
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  const client = new Client({name: "protocol-test", version: "1"});
  try {
    await client.connect(new StdioClientTransport({command: process.execPath, args: ["server.ts"],
      env: {SUPABASE_URL: "http://127.0.0.1:" + api.address().port,
        SUPABASE_PUBLISHABLE_KEY: "fixture", SYNQORA_AGENT_ACCESS_TOKEN: "fixture"}}));
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ["read_record"]);
    const read = recordId => client.callTool({name: "read_record", arguments: {recordId}});
    assert.deepEqual(JSON.parse((await read(record.id)).content[0].text), record);
    assert.equal((await read(randomUUID())).isError, true);
    assert.equal((await read("invalid")).isError, true);
    assert.equal(calls, 2);
  } finally {
    await client.close();
    api.close();
  }
});
