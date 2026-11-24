import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { z } from "zod";

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const item = z.string().trim().min(1).max(3000);
export const planInput = z.object({prompt:item,operationId:z.string().uuid()}).strict();
export const planSchema = z.object({
  requirements:z.array(z.object({key,title:item,body:item}).strict()).min(1).max(15),
  tasks:z.array(z.object({key,title:item,requirements:z.array(key),dependsOn:z.array(key)}).strict()).min(2).max(30)
}).strict().superRefine((p,ctx)=>{
  const rs=new Set(p.requirements.map(x=>x.key)), ts=new Map(p.tasks.map(x=>[x.key,x]));
  const bad=message=>ctx.addIssue({code:"custom",message});
  if(rs.size!==p.requirements.length||ts.size!==p.tasks.length)bad("Duplicate keys");
  const done=new Set(), active=new Set();
  function visit(k){
    if(active.has(k)){bad("Dependency cycle");return;}
    if(done.has(k)||!ts.has(k))return;
    active.add(k); for(const d of ts.get(k).dependsOn)visit(d);
    active.delete(k);done.add(k);
  }
  for(const t of p.tasks){
    if(t.requirements.some(k=>!rs.has(k))||t.dependsOn.some(k=>!ts.has(k)))bad("Unknown dependency");
    if(new Set(t.requirements).size!==t.requirements.length||new Set(t.dependsOn).size!==t.dependsOn.length)bad("Duplicate dependency");
    if(!t.requirements.length&&!t.dependsOn.length)bad("Task must trace to a requirement");
    visit(t.key);
  }
});
function executable(){
  for(const dir of (process.env.PATH||"").split(delimiter).filter(Boolean)){
    const bin=join(dir,process.platform==="win32"?"codex.exe":"codex");
    if(existsSync(bin))return [bin];
    if(process.platform==="win32"){
      const entry=join(dir,"node_modules","@openai","codex","bin","codex.js");
      if(existsSync(entry))return [process.execPath,entry];
    }
  }
  throw Object.assign(Error("Codex CLI not installed or not on PATH"),{status:503});
}
function execute(command,args,cwd){
  return new Promise((resolve,reject)=>{
    const child=spawn(command[0],[...command.slice(1),...args],{cwd,windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let out="",err="",overflow=false;
    const timer=setTimeout(()=>child.kill(),120000);
    child.stdout.on("data",b=>{out+=b;if(out.length>500000){overflow=true;child.kill();}});
    child.stderr.on("data",b=>{err=(err+b).slice(-10000);});
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",code=>{clearTimeout(timer);if(code!==0||overflow)reject(Object.assign(Error("Codex execution failed; check local login, quota and CLI version"),{status:503}));else resolve({out,err});});
  });
}
function parsePlan(rawResponse){
  return planSchema.parse(JSON.parse(rawResponse.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"")));
}
async function freePlan(prompt){
  const model="nvidia/nemotron-3.5-lightning:free";
  const instruction="Return ONLY valid JSON with requirements:[{key,title,body}],tasks:[{key,title,requirements:[requirement keys],dependsOn:[task keys]}]. Use lowercase unique keys, separate payment requirements from independent features, no cycles, 5 to 12 implementation tasks. No task is implemented.";
  const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(90000),
    headers:{Authorization:"Bearer "+process.env.OPENROUTER_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({model,messages:[{role:"system",content:instruction},{role:"user",content:prompt}],max_tokens:4000,temperature:0.1,provider:{allow_fallbacks:false}})
  });
  if(!res.ok)throw Object.assign(Error("OpenRouter free planner returned HTTP "+res.status),{status:503});
  const result=await res.json();
  if(result.model!==model)throw Object.assign(Error("Unexpected model; free planner refuses to save result"),{status:503});
  const rawResponse=result.choices?.[0]?.message?.content;
  if(typeof rawResponse!=="string"||!rawResponse.trim())throw Object.assign(Error("Empty free model response"),{status:503});
  return {plan:parsePlan(rawResponse),rawResponse,provider:"OpenRouter",model:result.model,createdAt:new Date().toISOString()};
}
export async function generatePlan(prompt){
  if(process.env.OPENROUTER_API_KEY)return freePlan(prompt);
  if(process.env.OPENAI_API_KEY||process.env.CODEX_API_KEY)throw Object.assign(Error("Metered API credentials present; use existing ChatGPT login only"),{status:503});
  const command=executable(), cwd=await mkdtemp(join(tmpdir(),"synqora-plan-"));
  try{
    const auth=await execute(command,["login","status"],cwd);
    if(!/logged in using chatgpt/i.test(auth.out+" "+auth.err))throw Object.assign(Error("ChatGPT CLI authentication required"),{status:503});
    const instruction="You are a planning model. Do not use tools, files, shell or network. Return ONLY JSON with requirements:[{key,title,body}],tasks:[{key,title,requirements:[requirement keys],dependsOn:[task keys]}]. Split independent requirements, especially payment, so only related tasks are impacted by later changes. All keys lowercase. No task is implemented. Project request: "+JSON.stringify(prompt);
    const {out}=await execute(command,["exec","--skip-git-repo-check","--ephemeral","--sandbox","read-only","--json","-c","approval_policy=\"never\"","-c","model_provider=\"openai\"","-m",process.env.SYNQORA_CODEX_MODEL||"gpt-6-astra",instruction],cwd);
    const events=out.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{return null}});
    const messages=events.filter(e=>e?.type==="item.completed"&&e.item?.type==="agent_message");
    if(!events.some(e=>e?.type==="turn.completed")||!messages.length)throw Object.assign(Error("No completed model response"),{status:503});
    const rawResponse=messages.at(-1).item.text;
    const plan=planSchema.parse(JSON.parse(rawResponse.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"")));
    return {plan,rawResponse,provider:"OpenAI Codex CLI",model:process.env.SYNQORA_CODEX_MODEL||"gpt-6-astra",createdAt:new Date().toISOString()};
  }finally{await rm(cwd,{recursive:true,force:true});}
}
