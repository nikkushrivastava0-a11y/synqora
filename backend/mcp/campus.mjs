import { PGlite } from "@electric-sql/pglite";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { request } from "./api-contract.ts";

export const id = n => "00000000-0000-4000-8000-"+String(n).padStart(12,"0");
export const workspace=id(1), requirement=id(2);
const uuid=z.string().uuid(), sources=z.array(z.object({recordId:uuid,revision:z.number().int().positive()}).strict());
export const inputs={
 read_record:{recordId:uuid}, list_tasks:{workspaceId:uuid}, get_sources:{taskId:uuid},
 check_revision:{recordId:uuid,revision:z.number().int().positive()}, get_task_context:{taskId:uuid},
 resume_task:{operationId:uuid}, claim_task:{taskId:uuid,operationId:uuid},
 submit_result:{taskId:uuid,operationId:uuid,body:z.string().trim().min(1),sources}
};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const rows=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=async(db,sql,args)=>(await rows(db,sql,args))[0];
export async function openCampus(path){
 const db=new PGlite(path);
 if(!(await one(db,"select to_regclass('campus_users') as name")).name){
 await db.transaction(async tx=>{
 await tx.exec(await readFile(new URL("./campus.sql",import.meta.url),"utf8"));
 for(const [n,name,role] of [[3,"Nitanshu","human"],[4,"Planner","agent"],[5,"Reviewer","agent"]])
 await tx.query("insert into campus_users values ($1,$2,$3,$4)",[id(n),workspace,name,role]);
 await tx.query("insert into records values ($1,$2,$3)",[requirement,workspace,"Registration API"]);
 await tx.query("insert into record_revisions values ($1,1,$2)",[requirement,"Register using fullName"]);
 for(const [i,title] of ["Registration form","API validator","Registration end-to-end test","Poster design","Venue map"].entries())
 await tx.query("insert into tasks(id,workspace,title,status) values ($1,$2,$3,$4)",[id(10+i),workspace,title,i>=3?"completed":"open"]);
 for(const n of [10,11])await tx.query("insert into task_sources values ($1,$2)",[id(n),requirement]);
 await tx.query("insert into task_dependencies values ($1,$2)",[id(10),id(12)]);
 });}
 return db;
}
const reads=new Set(["overview","agents","records","list_tasks","impact","conflicts","approvals","events","benchmarks"]);
export async function operate(db,user,op,target,input={}){
 return db.transaction(async tx=>{
 const actor=await one(tx,"select * from campus_users where id=$1",[user]);
 if(!actor)fail(401,"Sign in required");
 const w=actor.workspace;
 const query=(sql,args=[])=>rows(tx,sql,args);
 const first=(sql,args)=>one(tx,sql,args);
 const run=(sql,args)=>tx.query(sql,args);
 const human=()=>{if(actor.role!=="human")fail(403,"Human approval required")};
 const agent=()=>{if(actor.role!=="agent")fail(403,"Agent required")};
 const getRecord=async rid=>{const r=await first('select r.id,r.workspace as "workspaceId",r.title,v.revision,v.body from records r join record_revisions v on v.record=r.id where r.workspace=$1 and r.id=$2 order by revision desc limit 1',[w,rid]);if(!r)fail(404,"Record unavailable");return r};
 const getTask=async tid=>{const t=await first('select id,title,status,owner as "ownerAgentId" from tasks where workspace=$1 and id=$2',[w,tid]);if(!t)fail(404,"Task unavailable");return {...t,sources:await query(`with recursive upstream(id) as (select $2::uuid union select d.parent from task_dependencies d join upstream u on u.id=d.child join tasks p on p.id=d.parent and p.workspace=$1)
 select s.record as "recordId",max(v.revision) as revision from upstream u join task_sources s on s.task=u.id join records r on r.id=s.record and r.workspace=$1 join record_revisions v on v.record=r.id group by s.record order by s.record`,[w,tid])}};
 const approvals=()=>query('select id, conflict as "conflictId",state,decider as "decidedBy",reason,sources from approvals where workspace=$1 order by id',[w]);
 if(reads.has(op)&&target!==w)fail(404,"Workspace unavailable");
 if(inputs[op])input=z.object(inputs[op]).strict().parse(input);
 if(request[op])input=request[op].parse(input);
 const oid=input.operationId;
 if(op==="resume_task"){const row=await first("select response from operations where actor=$1 and id=$2",[user,oid]);if(!row)fail(404,"Operation unavailable");return row.response}
 const signature=oid&&createHash("sha256").update(JSON.stringify([op,target,input])).digest("hex");
 if(oid){const old=await first("select * from operations where id=$1",[oid]);if(old){if(old.actor!==user||old.digest!==signature)fail(409,"Operation mismatch");return old.response}}
 let out;
 switch(op){
 case "read_record":out={...await getRecord(input.recordId),agentId:user};break;
 case "check_revision":{const r=await getRecord(input.recordId);out={revision:r.revision,current:r.revision===input.revision};break}
 case "get_sources":return (await getTask(input.taskId)).sources;
 case "get_task_context":return {...await getTask(input.taskId),results:await query("select id,actor,body,sources,state from agent_results where task=$1 order by created,id",[input.taskId])};
 case "list_tasks":return Promise.all((await query("select id from tasks where workspace=$1 order by id",[w])).map(t=>getTask(t.id)));
 case "overview":return {workspaceId:w,name:"CampusFest website",taskCount:(await first("select count(*)::int as n from tasks where workspace=$1",[w])).n,pendingApprovals:(await approvals()).filter(a=>a.state==="pending").length};
 case "agents":return query("select id,name from campus_users where workspace=$1 and role='agent' order by id",[w]);
 case "records":return Promise.all((await query("select id from records where workspace=$1 order by id",[w])).map(r=>getRecord(r.id)));
 case "impact":return query('select source,task as "taskId",path from impact where workspace=$1 order by seq',[w]);
 case "events":return query('select id,at,action,agent as "agentId",actor as "userId",operation as "operationId",sources from audit_events where workspace=$1 order by at,id',[w]);
 case "approvals":return approvals();
 case "benchmarks":return [];
 case "conflicts":return query('select id,task as "taskId",result as "proposedResultId",used,current,state from conflicts where workspace=$1 order by id',[w]);
 case "createRecord":{if(target!==w)fail(404,"Workspace unavailable");human();const rid=randomUUID();await run("insert into records values($1,$2,$3)",[rid,w,input.title]);await run("insert into record_revisions values($1,1,$2)",[rid,input.body]);out=await getRecord(rid);break}
 case "reviseRecord":{
 human();const prev=await getRecord(target);if(prev.revision!==input.expectedRevision)fail(409,"Requirement changed");
 const revision=prev.revision+1;await run("insert into record_revisions values($1,$2,$3)",[target,revision,input.body]);
 const queue=(await query("select task from task_sources join tasks on tasks.id=task where record=$1 and workspace=$2 order by task",[target,w])).map(r=>[r.task]);
 const seen=new Set();
 for(let i=0;i<queue.length;i++){const path=queue[i],tid=path.at(-1);if(seen.has(tid))continue;seen.add(tid);
 await run("update tasks set status='needs_review' where id=$1 and workspace=$2",[tid,w]);
 await run("insert into impact(workspace,source,task,path) values ($1,$2,$3,$4)",[w,JSON.stringify({recordId:target,revision}),tid,JSON.stringify(path)]);
 for(const edge of await query("select child from task_dependencies join tasks on tasks.id=child where parent=$1 and workspace=$2 order by child",[tid,w]))queue.push([...path,edge.child]);}
 out=await getRecord(target);break}
 case "claim_task":{agent();const t=await getTask(input.taskId);if(t.status==="completed")fail(409,"Task completed");
 const active=await first("select actor from task_claims where task=$1 and expires>now()",[t.id]);if(active&&active.actor!==user)fail(409,"Claim held");
 await run("insert into task_claims values ($1,$2,now()+interval '30 minutes') on conflict(task) do update set actor=excluded.actor,expires=excluded.expires",[t.id,user]);
 await run("update tasks set owner=$2,status=case when status='open' then 'claimed' else status end where id=$1",[t.id,user]);out=await getTask(t.id);break}
 case "submit_result":{
 agent();const t=await getTask(input.taskId);
 if(t.status==="completed"||!(await first("select 1 from task_claims where task=$1 and actor=$2 and expires>now()",[t.id,user])))fail(409,"Active claim required");
 const used=[...input.sources].sort((a,b)=>a.recordId.localeCompare(b.recordId));
 if(used.length!==t.sources.length||used.some((s,i)=>s.recordId!==t.sources[i].recordId))fail(400,"Declare every required source once");
 for(const s of used)if(!await first("select 1 from record_revisions where record=$1 and revision=$2",[s.recordId,s.revision]))fail(400,"Unknown revision");
 const stale=used.some((s,i)=>s.revision!==t.sources[i].revision);
 const pending=await first("select id from conflicts where task=$1 and state='open'",[t.id]);
 const state=stale?"stale":pending||t.status==="needs_review"?"proposed":"accepted";
 const resultId=randomUUID();await run("insert into agent_results(id,task,actor,body,sources,state) values($1,$2,$3,$4,$5,$6)",[resultId,t.id,user,input.body,JSON.stringify(used),state]);
 let conflictId=pending?.id;
 if(stale||state==="proposed"){if(!conflictId){conflictId=randomUUID();await run("insert into conflicts values($1,$2,$3,$4,$5,$6,'open')",[conflictId,w,t.id,resultId,JSON.stringify(used),JSON.stringify(t.sources)])}
 await run("update tasks set status='needs_review' where id=$1",[t.id]);}
 else await run("update tasks set status='completed' where id=$1",[t.id]);
 out={resultId,state,conflictId:conflictId??null,used,current:t.sources};break}
 case "resolveConflict":{
 human();const c=await first("select * from conflicts where id=$1 and workspace=$2 and state='open'",[target,w]);
 if(!c)fail(404,"Open conflict unavailable");
 const r=await first("select * from agent_results where id=$1 and task=$2 and state='proposed'",[input.correctedResultId,c.task]);
 if(!r)fail(409,"Correction unavailable");
 if(await first("select 1 from approvals where conflict=$1 and state='pending'",[target]))fail(409,"Correction already pending");
 const aid=randomUUID();await run("insert into approvals values($1,$2,$3,$4,'pending',null,$5,$6)",[aid,w,target,r.id,input.reason,JSON.stringify(r.sources)]);out=(await approvals()).find(a=>a.id===aid);break}
 case "decideApproval":{
 human();const a=await first("select a.*,c.task,c.state as conflict_state from approvals a join conflicts c on a.conflict=c.id where a.id=$1 and a.workspace=$2",[target,w]);
 if(!a||a.state!=="pending"||a.conflict_state!=="open")fail(409,"Approval unavailable");
 if(input.decision==="approve"){const t=await getTask(a.task);
 if(t.sources.length!==a.sources.length||t.sources.some((s,i)=>s.recordId!==a.sources[i].recordId||s.revision!==a.sources[i].revision))fail(409,"Correction is stale");
 await run("update agent_results set state='accepted' where id=$1",[a.result]);
 await run("update conflicts set state='resolved' where id=$1",[a.conflict]);
 await run("update tasks set status='completed' where id=$1",[a.task]);}
 await run("update approvals set state=$2,decider=$3,reason=$4 where id=$1",[target,input.decision==="approve"?"approved":"rejected",user,input.reason]);out=(await approvals()).find(x=>x.id===target);break}
 default:fail(404,"Unknown operation");
 }
 if(oid){await run("insert into operations values($1,$2,$3,$4)",[oid,user,signature,JSON.stringify(out)]);
 await run("insert into audit_events(workspace,action,actor,agent,operation,sources,reason) values($1,$2,$3,$4,$5,$6,$7)",[w,op,user,actor.role==="agent"?user:null,oid,JSON.stringify(out.sources??out.used??(out.revision?[{recordId:out.id,revision:out.revision}]:[])),input.reason??null]);}
 return out;
 });
}
