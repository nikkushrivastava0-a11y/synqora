import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, rename, writeFile, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const backend = join(root, "backend/mcp");
const frontend = join(root, "frontend");
const folder = join(backend, ".synqora-local", "judge");
const active = join(folder, "current");
const resetFile = join(folder, "reset-request");
const address = "http://127.0.0.1:4173";
const workspace = "00000000-0000-4000-8000-000000000001";
await mkdir(folder, { recursive: true });
if (process.argv.includes("--reset")) {
  await writeFile(resetFile, "reset");
  console.log("Reset queued. The demo window applies it now or on next start.");
  process.exit(0);
}
const children = new Set();
const env = { ...process.env, PORT: "4317", SYNQORA_STATE_DIR: active,
  SYNQORA_SESSIONS: join(active,"sessions.json"), VITE_WORKSPACE_ID: workspace,
  VITE_API_BASE_URL: "", VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" };
function launch(cwd,args) {
  const child = spawn(process.execPath,args,{cwd,env,stdio:"inherit"});
  children.add(child);
  child.once("exit",()=>children.delete(child));
  return child;
}
async function free(port) {
  const probe=createServer();
  probe.listen(port,"127.0.0.1");
  try { await once(probe,"listening"); } catch { throw Error("Close the previous demo or seed window using port "+port+" and restart."); }
  await new Promise(resolve=>probe.close(resolve));
}
async function waitFor(child,check) {
  for(let i=0;i<120;i++){
    if(!children.has(child))throw Error("Demo service exited during startup");
    try{if(await check())return;}catch{}
    await sleep(250);
  }
  throw Error("Demo service readiness check timed out");
}
async function rotate(){
  try {await rename(active,join(folder,"before-reset-"+Date.now()));} catch(e){if(e.code!=="ENOENT")throw e;}
  await rm(resetFile,{force:true});
}
async function requested(){try{await stat(resetFile);return true;}catch(e){if(e.code!=="ENOENT")throw e;return false;}}
async function startBackend(){
  const child=launch(backend,["local-api.mjs"]);
  await waitFor(child,async()=>{
    const {human}=JSON.parse(await readFile(env.SYNQORA_SESSIONS,"utf8"));
    return (await fetch("http://127.0.0.1:4317/api/workspaces/"+workspace+"/overview",{headers:{Authorization:"Bearer "+human}})).ok;
  });
  return child;
}
function stop(){for(const child of children)child.kill();}
process.on("exit",stop);
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>process.exit(0));
try{
  await free(4317);await free(4173);
  if(await requested())await rotate();
  let api=await startBackend();
  const vite=resolve(frontend,"node_modules/vite/bin/vite.js");
  const build=spawnSync(process.execPath,[vite,"build"],{cwd:frontend,env,stdio:"inherit"});
  if(build.status!==0)throw Error("Frontend build failed");
  const web=launch(frontend,[vite,"preview","--host","127.0.0.1","--port","4173","--strictPort"]);
  await waitFor(web,async()=> (await fetch(address+"/api/workspaces/"+workspace+"/overview")).ok);
  console.log("CampusFest ready at "+address+". Keep this window open.");
  if(process.platform==="win32")spawnSync("cmd.exe",["/d","/c","start","",address]);
  let restarted = false;
  while(children.has(web)){
    if (!children.has(api)) {
      if (restarted) throw Error("Backend stopped twice. State preserved; inspect the backend error before restarting.");
      restarted = true;
      console.log("Backend stopped. Reopening the existing CampusFest database.");
      api = await startBackend();
      console.log("Backend recovered. Refresh the browser or retry the same operation.");
    }
    await sleep(400);
    if(await requested() && children.has(api)){
      const exited=once(api,"exit");api.kill();await exited;
      await rotate();api=await startBackend();console.log("Clean CampusFest seed ready. Refresh the browser.");
    }
  }
  throw Error("A demo service stopped");
}finally{stop();}
