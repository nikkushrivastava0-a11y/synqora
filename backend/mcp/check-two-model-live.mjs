// Requires a freshly started disposable local demo with both signed-in CLIs.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const file=resolve(process.env.SYNQORA_SESSIONS || ".synqora-local/judge/current/sessions.json");
const {human,reviewer}=JSON.parse(await readFile(file,"utf8"));
const workspace="00000000-0000-4000-8000-000000000001";
const base="/api/workspaces/"+workspace;
const root="http://127.0.0.1:4317";
async function api(path,body,token=human){
  const res=await fetch(root+path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:body&&JSON.stringify(body),signal:AbortSignal.timeout(160000)});
  const json=await res.json();
  if(!res.ok||!json.success)throw Error(path+" HTTP "+res.status+": "+(json.error?.message||"failed"));
  return json.data;
}
const prompt="Plan an Amazon-like website using Razorpay. Split payment requirements from catalog, search, accounts and inventory. Include independent tasks and checkout dependencies. Do not implement anything.";
console.log("Running real Codex planner...");
const plan=await api(base+"/plan",{prompt,operationId:randomUUID()});
assert.equal(plan.provider,"OpenAI Codex CLI");
assert.ok(plan.rawResponse && plan.planId && plan.reviewTaskId);
const before=await api(base+"/tasks");
assert.ok(plan.tasks.every(p=>before.find(t=>t.id===p.id)?.status==="open"));
console.log("Running real Gemini review of saved plan",plan.planId);
const input={planId:plan.planId,revision:plan.revision,reviewTaskId:plan.reviewTaskId,operationId:randomUUID()};
const review=await api(base+"/review",input);
assert.equal(review.state,"accepted");
assert.equal(review.provider,"Google Gemini API");
assert.match(review.model,/flash/);
assert.ok(review.rawResponse && review.reviewId);
const record=await api("/mcp/read_record",{recordId:review.reviewId},reviewer);
assert.equal(record.provenance.reviews.recordId,plan.planId);
assert.equal(record.provenance.reviews.revision,plan.revision);
assert.equal(JSON.parse(record.body).rawResponse,review.rawResponse);
const replay=await api(base+"/review",input);
assert.equal(replay.reviewId,review.reviewId);
const payment=plan.requirements.find(r=>/razorpay/i.test(r.body));
assert.ok(payment,"Planner did not provide a Razorpay requirement");
const plannedIds=new Set(plan.tasks.map(t=>t.id));
const planned=before.filter(t=>plannedIds.has(t.id));
const affected=planned.filter(t=>t.sources.some(s=>s.recordId===payment.id));
const unaffected=planned.filter(t=>!affected.some(a=>a.id===t.id));
assert.ok(affected.length && unaffected.length,"Planner did not separate payment from unrelated tasks");
const changed=await api("/api/records/"+payment.id+"/revisions",{operationId:randomUUID(),expectedRevision:payment.revision,body:payment.body.replace(/razorpay/gi,"Stripe"),reason:"Live demo switch to Stripe"});
const after=await api(base+"/tasks");
const impact=await api(base+"/impact");
for(const task of affected){
  assert.equal(after.find(t=>t.id===task.id)?.status,"needs_review");
  assert.ok(impact.some(i=>i.taskId===task.id&&i.source.recordId===payment.id&&i.source.revision===changed.revision));
}
for(const task of unaffected)assert.equal(after.find(t=>t.id===task.id)?.status,task.status);
const events=await api(base+"/events");
assert.ok(events.some(e=>e.action==="read_record"&&e.agentId===record.agentId&&e.sources.some(s=>s.recordId===plan.planId&&s.revision===plan.revision)));
assert.equal(events.filter(e=>e.action==="submit_result"&&e.operationId===input.operationId).length,1);
const proof={workspace,planId:plan.planId,planRevision:plan.revision,plannerModel:plan.model,reviewId:review.reviewId,reviewModel:review.model,reviewCreatedAt:review.createdAt,changedRequirementId:payment.id,newRevision:changed.revision,affected:affected.map(t=>({id:t.id,title:t.title})),preserved:unaffected.map(t=>({id:t.id,title:t.title})),reviewReplayVerified:true,verifiedAt:new Date().toISOString()};
const output=resolve(dirname(file),"two-model-proof.json");
await writeFile(output,JSON.stringify(proof,null,2));
console.log("PASS: actual two-model shared database handoff and selective impact verified",proof);
console.log("Proof:",output);
