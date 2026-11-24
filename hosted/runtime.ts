import {client} from './api';
import {openCampus,operate,id,workspace,requirement} from './hosted/campus.mjs';
export const auth=null;
export const mockMode=false;
const db=openCampus('idb://synqora-campusfest-v1');
const reads={overview:'overview',tasks:'list_tasks',records:'records',agents:'agents',impact:'impact',events:'events',conflicts:'conflicts',approvals:'approvals',benchmarks:'benchmarks'};
const mutations={'records/revisions':'reviseRecord','conflicts/resolve':'resolveConflict','approvals/decision':'decideApproval'};
export async function connect(){
 const store=await db;
 return client(workspace,async(path,init)=>{
 try{
 const [, ,group,target,action]=path.split('/');
 let input=JSON.parse(String(init?.body??'{}'));
 const op=init?.method==='POST'?(group==='workspaces'?'createRecord':mutations[group+'/'+action]):reads[action];
 if(op==='list_tasks')input={workspaceId:workspace};
 const out=await operate(store,id(3),op,target,input);
 if(op==='reviseRecord'&&target===requirement&&out.revision===2){
 const taskId=id(10);
 await operate(store,id(5),'claim_task',taskId,{taskId,operationId:id(101)});
 for(const [rev,body] of [[1,'Scripted stale result: form uses fullName'],[2,'Scripted correction: '+out.body]]){
 await operate(store,id(5),'submit_result',taskId,{taskId,operationId:id(101+rev),body,sources:[{recordId:requirement,revision:rev}]});}
 }
 return Response.json({success:true,data:out});
 }catch(e){return Response.json({success:false,error:{code:'DEMO_REQUEST',message:String(e.message)}},{status:e.status??400})}
 });
}
