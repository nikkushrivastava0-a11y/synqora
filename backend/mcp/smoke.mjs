import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { id, workspace } from "./campus.mjs";
const sessions=JSON.parse(await readFile((process.env.SYNQORA_STATE_DIR??".synqora-local")+"/sessions.json","utf8"));
const root="http://127.0.0.1:"+Number(process.env.PORT??4317);
for(const name of ["overview","tasks","impact","events"]){
 const r=await fetch(root+"/api/workspaces/"+workspace+"/"+name,{headers:{Authorization:"Bearer "+sessions.human}});
 assert.equal(r.status,200);const {data}=await r.json();
 if(name==="tasks")assert.equal(data.length,5);
 console.log(name,Array.isArray(data)?data.length:data.name);
}
const detail=await fetch(root+"/mcp/get_task_context",{method:"POST",headers:{Authorization:"Bearer "+sessions.planner,"Content-Type":"application/json"},body:JSON.stringify({taskId:id(10)})});
assert.equal(detail.status,200);assert.equal((await detail.json()).data.title,"Registration form");
console.log("Task detail passed");
