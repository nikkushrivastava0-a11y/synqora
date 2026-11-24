import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { inputs } from "./campus.mjs";
const role = process.env.SYNQORA_AGENT;
if (!["planner", "reviewer"].includes(role))
  throw Error("Select planner or reviewer");
const session = JSON.parse(
  await readFile(
    process.env.SYNQORA_SESSIONS ?? ".synqora-local/sessions.json",
    "utf8",
  ),
)[role];
const server = new McpServer({ name: "synqora-campusfest", version: "1.0.0" });
for (const [name, inputSchema] of Object.entries(inputs))
  server.registerTool(name, { inputSchema }, async (input) => {
    const r = await fetch(
      "http://127.0.0.1:" + Number(process.env.PORT ?? 4317) + "/mcp/" + name,
      {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: "Bearer " + session,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    return {
      isError: !r.ok,
      content: [{ type: "text", text: JSON.stringify(await r.json()) }],
    };
  });
await server.connect(new StdioServerTransport());
