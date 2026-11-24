import { useRef, useState } from "react";
import type { Workspace } from "./api";
import { z } from "zod";
type Requirement = {id:string;title:string;body:string;revision:number};
type Plan = {planId:string;revision:number;reviewTaskId:string;provider:string;model:string;createdAt:string;rawResponse:string;requirements:Requirement[];tasks:{id:string;title:string;status:string}[]};
type Review = {reviewId:string;planId:string;planRevision:number;model:string;createdAt:string;rawResponse:string;state:string;sourceRevisions:{recordId:string;revision:number}[]};
const sourceSchema=z.object({recordId:z.string().uuid(),revision:z.number().int().positive()});
const savedPlanSchema=z.object({prompt:z.string(),provider:z.enum(["OpenRouter","OpenAI Codex CLI"]),model:z.string(),createdAt:z.string(),rawResponse:z.string().min(1),requirements:z.array(z.object({id:z.string().uuid(),title:z.string(),body:z.string(),revision:z.number()})).min(1),tasks:z.array(z.object({id:z.string().uuid(),title:z.string(),status:z.string()})).min(1)});
const savedReviewSchema=z.object({provider:z.literal("Google Gemini API"),planId:z.string().uuid(),planRevision:z.number(),model:z.string(),createdAt:z.string(),rawResponse:z.string().min(1),sourceRevisions:z.array(sourceSchema)});
function json(body:string):unknown {try{return JSON.parse(body)}catch{return null}}
function restore(workspace:Workspace){
  const plans=workspace.records.flatMap(record=>{
    if(record.title!=="AI project planning result")return [];
    const value=savedPlanSchema.safeParse(json(record.body));
    if(!value.success)return [];
    const p=value.data;
    const ids=p.requirements.map(r=>r.id).sort().join(",");
    const matches=workspace.tasks.filter(t=>t.title==="Independent AI plan review"&&t.sources.map(s=>s.recordId).sort().join(",")===ids);
    if(matches.length!==1||!p.tasks.every(t=>workspace.tasks.some(w=>w.id===t.id)))return [];
    return [{...p,planId:record.id,revision:record.revision,reviewTaskId:matches[0].id}];
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const plan=plans[0];
  if(!plan)return {};
  const reviews=workspace.records.flatMap(record=>{
    if(record.title!=="Independent AI plan review result")return [];
    const value=savedReviewSchema.safeParse(json(record.body));
    if(!value.success||value.data.planId!==plan.planId||value.data.planRevision!==plan.revision)return [];
    return [{...value.data,reviewId:record.id,state:"saved — see task status"}];
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return {plan,review:reviews[0]};
}
async function post<T>(path:string,body:unknown):Promise<T>{
  const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(150000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.success!==true)throw Error(payload?.error?.message || "API request failed ("+response.status+").");
  return payload.data as T;
}
export function LiveModels({workspace,refresh}:{workspace:Workspace;refresh:()=>Promise<void>}){
  const [restored]=useState(()=>restore(workspace));
  const [prompt,setPrompt]=useState(restored.plan?.prompt || "Plan a simple online book store with catalog, search, cart and Razorpay payments. Define 5 tasks and dependencies.");
  const [plan,setPlan]=useState<Plan>(restored.plan);
  const [review,setReview]=useState<Review>(restored.review);
  const payment=restored.plan?.requirements.find(r=>/razorpay|payment/i.test(r.title+" "+r.body));
  const [requirement,setRequirement]=useState(payment?.id||"");
  const [replacement,setReplacement]=useState((workspace.records.find(r=>r.id===payment?.id)?.body||"").replace(/razorpay/gi,"Stripe"));
  const [progress,setProgress]=useState("");
  const [error,setError]=useState("");
  const lock=useRef(false);
  const base="/api/workspaces/"+workspace.overview.workspaceId;
  const current=workspace.records.find(r=>r.id===requirement);
  const liveTasks=workspace.tasks.filter(t=>plan?.tasks.some(p=>p.id===t.id));
  const pending=useRef<{key:string;id:string}|undefined>(undefined);
  async function run<T>(key:string,path:string,body:Record<string,unknown>,done:(value:T)=>void){
    if(lock.current)return;
    lock.current=true;setProgress(key);setError("");
    const fingerprint=JSON.stringify([key,path,body]);
    if(pending.current?.key!==fingerprint)pending.current={key:fingerprint,id:crypto.randomUUID()};
    try{
      const value=await post<T>(path,{...body,operationId:pending.current.id});
      done(value);pending.current=undefined;
    }catch(e){setError(e instanceof Error?e.message:"Request failed");}
    finally{try{await refresh();}finally{setProgress("");lock.current=false;}}
  }
  const busy=Boolean(progress);
  return <section className="panel" aria-label="Live two-model demo">
    <h2>Live AI collaboration</h2>
    <p>Real model outputs and shared database evidence. No simulated responses.</p>
    {restored.plan&&plan?.planId===restored.plan.planId&&<p>Saved plan restored from the workspace database. No new model call was made.</p>}
    <label>Custom project prompt<textarea style={{width:"100%",minHeight:86}} value={prompt} maxLength={3000} disabled={busy} onChange={e=>setPrompt(e.target.value)}/></label>
    <div className="row" style={{flexWrap:"wrap"}}>
      <button disabled={busy||!prompt.trim()} onClick={()=>void run<Plan>("Running AI planner",base+"/plan",{prompt},p=>{setPlan(p);setReview(undefined);const r=p.requirements.find(r=>/razorpay|payment/i.test(r.title+" "+r.body));setRequirement(r?.id||"");setReplacement(r?.body.replace(/razorpay/gi,"Stripe")||"");})}>Run planner</button>
      <button disabled={busy||!plan||Boolean(review)} onClick={()=>plan&&void run<Review>("Running Gemini review",base+"/review",{planId:plan.planId,revision:plan.revision,reviewTaskId:plan.reviewTaskId},setReview)}>Run Gemini review</button>
    </div>
    {busy&&<p role="status">{progress}…</p>}{error&&<p className="error" role="alert">{error}</p>}
    {plan&&<><article><h3>Actual Planner Response</h3><small>{plan.provider} · {plan.model} · {plan.createdAt}</small><p>Plan {plan.planId} · revision {plan.revision}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{plan.rawResponse}</pre></article>
    <article><h3>Actual Gemini response</h3>{review?<><small>{review.model} · {review.createdAt} · {review.state}</small><p>Review {review.reviewId} · plan {review.planId} r{review.planRevision}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{review.rawResponse}</pre></>:<p>No saved Gemini response yet.</p>}</article>
    <p>{liveTasks.length} planned implementation tasks · {liveTasks.filter(t=>t.status==="open").length} open · {liveTasks.filter(t=>t.status==="needs_review").length} needs review · {liveTasks.filter(t=>t.status==="completed").length} completed</p>
    <label>Change requirement<select value={requirement} disabled={busy} onChange={e=>{setRequirement(e.target.value);setReplacement(workspace.records.find(r=>r.id===e.target.value)?.body||"");}}><option value="">Select requirement</option>{plan.requirements.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
    {current&&<p>Current revision {current.revision}: {current.body}</p>}
    <textarea aria-label="Updated requirement" style={{width:"100%",minHeight:65}} value={replacement} disabled={busy} onChange={e=>setReplacement(e.target.value)}/>
    <button disabled={busy||!current||!replacement.trim()||replacement===current.body} onClick={()=>current&&void run("Changing requirement","/api/records/"+current.id+"/revisions",{expectedRevision:current.revision,body:replacement,reason:"Human requested project requirement update"},()=>{})}>Change requirement</button>
    <p>Recorded impact: {workspace.impact.filter(i=>i.source.recordId===requirement&&i.source.revision===current?.revision).length} dependency paths for current revision.</p></>}
  </section>;
}
