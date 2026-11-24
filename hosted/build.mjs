// Build an independent public judge workspace from the shared SQL engine and UI.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
process.chdir(new URL('../frontend/',import.meta.url));
const generated=resolve('src/hosted');
await mkdir(generated,{recursive:true});
let engine=await readFile('../backend/mcp/campus.mjs','utf8');
engine=engine.replace('import { randomUUID, createHash } from "node:crypto";','const randomUUID = () => crypto.randomUUID();')
.replace('import { readFile } from "node:fs/promises";','import schema from "./campus.sql?raw";')
.replace('await readFile(new URL("./campus.sql", import.meta.url), "utf8")','schema')
.replace(/createHash\("sha256"\)\s*\.update\(JSON.stringify\(\[op, target, input\]\)\)\s*\.digest\("hex"\)/,'JSON.stringify([op,target,input])');
await writeFile(generated+'/campus.mjs',engine);
await copyFile('../backend/mcp/campus.sql',generated+'/campus.sql');
await copyFile('../backend/mcp/api-contract.ts',generated+'/api-contract.ts');
await copyFile('../hosted/runtime.ts','src/runtime.ts');
let ui=await readFile('src/main.tsx','utf8');
ui=ui.replace('"LIVE API"','"BROWSER DEMO · SCRIPTED AGENTS"').replace('placeholder="Result UUID from the correction run"','defaultValue={s.records.filter(r=>r.title===taskName(c.taskId)+" result").find(r=>r.body.startsWith("Scripted correction:"))?.id ?? ""} placeholder="Result UUID from the correction run"');
await writeFile('src/main.tsx',ui);
const run=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit'});process.exitCode=run.status??1;
