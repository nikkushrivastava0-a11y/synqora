import { useRef, useState } from "react";
import type { Workspace } from "./api";
type Requirement = {id:string;title:string;body:string;revision:number};
type Plan = {planId:string;revision:number;reviewTaskId:string;provider:string;model:string;createdAt:string;rawResponse:string;requirements:Requirement[];tasks:{id:string;title:string;status:string}[]};
type Review = {reviewId:string;planId:string;planRevision:number;model:string;createdAt:string;rawResponse:string;state:string;sourceRevisions:{recordId:string;revision:number}[]};
async function post<T>(path:string,body:unknown):Promise<T>{
  const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(150000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.success!==true)throw Error(payload?.error?.message || "API request failed ("+response.status+").");
  return payload.data as T;
}
export function LiveModels({workspace,refresh}:{workspace:Workspace;refresh:()=>Promise<void>}){
  const [prompt,setPrompt]=useState("Create an Amazon-like e-commerce website using Razorpay for payments. Include independent catalog, search and account tasks, payment integration and checkout dependencies.");
  const [plan,setPlan]=useState<Plan>();
  const [review,setReview]=useState<Review>();
  const [requirement,setRequirement]=useState("");
  const [replacement,setReplacement]=useState("");
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
    <label>Custom project prompt<textarea style={{width:"100%",minHeight:86}} value={prompt} maxLength={3000} disabled={busy} onChange={e=>setPrompt(e.target.value)}/></label>
    <div className="row" style={{flexWrap:"wrap"}}>
      <button disabled={busy||!prompt.trim()} onClick={()=>void run<Plan>("Running Codex planner",base+"/plan",{prompt},p=>{setPlan(p);setReview(undefined);const r=p.requirements.find(r=>/razorpay|payment/i.test(r.title+" "+r.body));setRequirement(r?.id||"");setReplacement(r?.body.replace(/razorpay/gi,"Stripe")||"");})}>Run planner</button>
      <button disabled={busy||!plan||Boolean(review)} onClick={()=>plan&&void run<Review>("Running Gemini review",base+"/review",{planId:plan.planId,revision:plan.revision,reviewTaskId:plan.reviewTaskId},setReview)}>Run Gemini review</button>
    </div>
    {busy&&<p role="status">{progress}…</p>}{error&&<p className="error" role="alert">{error}</p>}
    {plan&&<><article><h3>Actual GPT response</h3><small>{plan.provider} · {plan.model} · {plan.createdAt}</small><p>Plan {plan.planId} · revision {plan.revision}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{plan.rawResponse}</pre></article>
    <article><h3>Actual Gemini response</h3>{review?<><small>{review.model} · {review.createdAt} · {review.state}</small><p>Review {review.reviewId} · plan {review.planId} r{review.planRevision}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{review.rawResponse}</pre></>:<p>No saved Gemini response yet.</p>}</article>
    <p>{liveTasks.length} planned implementation tasks · {liveTasks.filter(t=>t.status==="open").length} open · {liveTasks.filter(t=>t.status==="needs_review").length} needs review · {liveTasks.filter(t=>t.status==="completed").length} completed</p>
    <label>Change requirement<select value={requirement} disabled={busy} onChange={e=>{setRequirement(e.target.value);setReplacement(workspace.records.find(r=>r.id===e.target.value)?.body||"");}}><option value="">Select requirement</option>{plan.requirements.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
    {current&&<p>Current revision {current.revision}: {current.body}</p>}
    <textarea aria-label="Updated requirement" style={{width:"100%",minHeight:65}} value={replacement} disabled={busy} onChange={e=>setReplacement(e.target.value)}/>
    <button disabled={busy||!current||!replacement.trim()||replacement===current.body} onClick={()=>current&&void run("Changing requirement","/api/records/"+current.id+"/revisions",{expectedRevision:current.revision,body:replacement,reason:"Human requested project requirement update"},()=>{})}>Change requirement</button>
    <p>Recorded impact: {workspace.impact.filter(i=>i.source.recordId===requirement&&i.source.revision===current?.revision).length} dependency paths for current revision.</p></>}
  </section>;
}
