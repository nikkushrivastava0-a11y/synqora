import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const file = process.argv[2] || process.env.SYNQORA_SESSIONS;
if (!file)
  throw Error("Pass the sessions.json path from the running local seed.");
await access(file);
const env = {
  ...process.env,
  SYNQORA_SESSIONS: resolve(file),
  VITE_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
  VITE_API_BASE_URL: "",
};
const vite = resolve(require.resolve("vite/package.json"), "../bin/vite.js");
for (const [script, args] of [
  [require.resolve("typescript/bin/tsc"), ["--noEmit"]],
  [vite, ["build"]],
  [vite, ["preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"]],
]) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
