import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openCampus, operate, id, workspace } from "./campus.mjs";
import { planSchema } from "./gpt-planner.mjs";
const fixture={requirements:[{key:"payment",title:"Payment",body:"Razorpay"},{key:"catalog",title:"Catalogue",body:"Browse products"}],tasks:[{key:"gateway",title:"Payment gateway",requirements:["payment"],dependsOn:[]},{key:"webhook",title:"Webhook",requirements:[],dependsOn:["gateway"]},{key:"catalogue",title:"Catalogue",requirements:["catalog"],dependsOn:[]}]};
test("reject unknown edges and cycles",()=>{
  assert.throws(()=>planSchema.parse({...fixture,tasks:[...fixture.tasks,{key:"bad",title:"Bad",requirements:[],dependsOn:["missing"]}]}));
  assert.throws(()=>planSchema.parse({...fixture,tasks:[{...fixture.tasks[0],dependsOn:["webhook"]},...fixture.tasks.slice(1)]}));
});
test("synthetic test fixture only: plan persistence, reviewer retrieval, selective rework",async()=>{
 const db=await openCampus();
 try{
 const p=await operate(db,id(3),"saveDynamicPlan",workspace,{operationId:randomUUID(),prompt:"TEST FIXTURE",plan:fixture,provider:"TEST FIXTURE",model:"TEST FIXTURE",createdAt:new Date().toISOString(),rawResponse:JSON.stringify(fixture)});
 const rec=await operate(db,id(5),"read_record",p.planId,{recordId:p.planId});
 assert.equal(rec.revision,1);
 assert.equal(rec.provenance.authorAgentId,id(4));
 const payment=p.requirements.find(r=>r.title==="Payment");
 await operate(db,id(3),"reviseRecord",payment.id,{operationId:randomUUID(),expectedRevision:1,body:"Stripe",reason:"test"});
 const tasks=await operate(db,id(3),"list_tasks",workspace,{workspaceId:workspace});
 for(const t of p.tasks)assert.equal(tasks.find(x=>x.id===t.id).status,t.title==="Catalogue"?"open":"needs_review");
 }finally{await db.close();}
});
