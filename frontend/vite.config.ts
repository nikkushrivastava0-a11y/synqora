import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

// Optional human-only bridge for the seeded, single-operator loopback demo.
function bridge(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const file = process.env.SYNQORA_SESSIONS;
  if (!file || !req.url?.startsWith("/api/")) return next();
  const route = req.url;
  const safe =
    /^\/api\/(?:workspaces\/[\da-f-]+\/(?:overview|agents|tasks|records|events|benchmarks|conflicts|impact|approvals)|(?:records\/[\da-f-]+\/revisions|conflicts\/[\da-f-]+\/resolve|approvals\/[\da-f-]+\/decision))$/i;
  if (
    !safe.test(route) ||
    !["GET", "POST"].includes(req.method || "") ||
    !/^127\.0\.0\.1:\d+$/.test(req.headers.host || "") ||
    req.headers["sec-fetch-site"] === "cross-site" ||
    (req.method === "POST" &&
      req.headers.origin !== "http://" + req.headers.host)
  ) {
    res.writeHead(403).end();
    return;
  }
  void (async () => {
    const parts: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      size += part.length;
      if (size > 65536) {
        res.writeHead(413).end();
        return;
      }
      parts.push(part);
    }
    const { human } = JSON.parse(await readFile(file, "utf8"));
    const response = await fetch("http://127.0.0.1:4317" + route, {
      method: req.method,
      redirect: "error",
      headers: {
        Authorization: "Bearer " + human,
        "Content-Type": "application/json",
      },
      body: req.method === "POST" ? Buffer.concat(parts) : undefined,
    });
    res.writeHead(response.status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(await response.text());
  })().catch(() => res.writeHead(502).end());
}
export default defineConfig({
  server: {
    host: "127.0.0.1",
    fs: {
      strict: true,
      deny: [
        "**/sessions.json",
        "**/.synqora-local/**",
        ".env",
        ".env.*",
        "**/*.{crt,pem}",
        "**/.git/**",
      ],
    },
  },
  preview: { host: "127.0.0.1" },
  plugins: [
    {
      name: "private-local-api",
      configureServer(s) {
        s.middlewares.use(bridge);
      },
      configurePreviewServer(s) {
        s.middlewares.use(bridge);
      },
    },
  ],
});
