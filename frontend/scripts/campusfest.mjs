import { access, readFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire(import.meta.url);
const file = resolve(process.argv[2] || process.env.SYNQORA_SESSIONS || "");
if (basename(file) !== "sessions.json")
  throw Error("Pass the sessions.json path from the local backend.");
const stateDir = dirname(file);
const backendDir = resolve(process.env.SYNQORA_BACKEND_DIR || dirname(stateDir));
const workspace = "00000000-0000-4000-8000-000000000001";
const root = "http://127.0.0.1:4317";
let backend;
async function probe() {
  // First distinguish an absent HTTP listener from an authentication failure.
  let reachable;
  try {
    reachable = await fetch(root + "/api/workspaces/" + workspace + "/overview", { signal: AbortSignal.timeout(2000) });
  } catch (error) {
    if (error?.cause?.code === "ECONNREFUSED") return false;
    throw Error("Backend port 4317 is not responding normally. Check the backend terminal.");
  }
  await reachable.body?.cancel();
  const { human } = JSON.parse(await readFile(file, "utf8"));
  if (typeof human !== "string" || !human) throw Error("The local sessions file has no human session.");
  const response = await fetch(root + "/api/workspaces/" + workspace + "/overview", {
    headers: { Authorization: "Bearer " + human },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error("Backend is running but rejected the workspace request (HTTP " + response.status + "). Check the sessions path and backend state directory.");
  }
  const body = await response.json();
  if (body.success !== true || body.data?.workspaceId !== workspace)
    throw Error("Port 4317 did not return the expected SYNQORA workspace.");
  return true;
}
function cleanup() {
  if (backend && backend.exitCode === null && !backend.killed) backend.kill();
}
process.once("exit", cleanup);
process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });
try {
  if (!(await probe())) {
    const entry = resolve(backendDir, "local-api.mjs");
    await access(entry);
    console.log("Backend not running. Starting local API on port 4317 using the existing state directory.");
    backend = spawn(process.execPath, [entry], {
      cwd: backendDir,
      env: { ...process.env, PORT: "4317", SYNQORA_STATE_DIR: stateDir },
      stdio: "inherit",
    });
    let spawnError;
    backend.on("error", error => { spawnError = error; });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError;
      if (backend.exitCode !== null || backend.signalCode !== null) throw Error("Backend stopped during startup. See the backend error above.");
      await sleep(500);
      if (await probe()) { ready = true; break; }
    }
    if (!ready) throw Error("Backend did not become ready on port 4317.");
  }
  console.log("Backend connected: authenticated workspace overview OK.");
  const env = {
    ...process.env,
    SYNQORA_SESSIONS: file,
    VITE_WORKSPACE_ID: workspace,
    VITE_API_BASE_URL: "",
  };
  const vite = resolve(require.resolve("vite/package.json"), "../bin/vite.js");
  for (const [script, args] of [
    [require.resolve("typescript/bin/tsc"), ["--noEmit"]],
    [vite, ["build"]],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { env, stdio: "inherit" });
    if (result.status !== 0) throw Error("Frontend build failed.");
  }
  const preview = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { env, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => {
    preview.once("error", reject);
    preview.once("exit", code => resolve(code ?? 1));
  });
  process.exitCode = code;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Startup failed.");
  process.exitCode = 1;
} finally {
  cleanup();
}
