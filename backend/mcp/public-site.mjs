import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {initializeCampus,operate,id,workspace,requirement} from './campus.mjs';

// Each visitor gets an independent ephemeral PostgreSQL schema. The operator's local sessions never leave the laptop.
const db=new PGlite();
const sessions=new Map();
const root=fileURLToPath(new URL('../../frontend/dist/',import.meta.url));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.svg':'image/svg+xml','.ico':'image/x-icon'};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const scope=name=>({transaction:fn=>db.transaction(async tx=>{await tx.exec('set local search_path to '+name+', pg_catalog');return fn(tx)}),query:(s,a)=>db.transaction(async tx=>{await tx.exec('set local search_path to '+name+', pg_catalog');return tx.query(s,a)})});
function session(req){return sessions.get((req.headers.cookie??'').match(/(?:^|; )campus=([a-f0-9-]{36})(?:;|$)/)?.[1])}
const wRoutes={overview:'overview',tasks:'list_tasks',records:'records',agents:'agents',impact:'impact',events:'events',conflicts:'conflicts',approvals:'approvals',benchmarks:'benchmarks'};
const mutations={'records/revisions':'reviseRecord','conflicts/resolve':'resolveConflict','approvals/decision':'decideApproval'};
const server=createServer(async(req,res)=>{
try{
const path=new URL(req.url,'http://localhost').pathname;
if(path==='/health'){res.end('ok');return}
if(!path.startsWith('/api/')){
 if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Method unavailable');
 const file=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(resolve(root)+sep))fail(404,'Unavailable');
 const bytes=await readFile(file).catch(()=>fail(404,'Unavailable'));
 if(path==='/'){
 let s=session(req);
 if(!s){
 if(sessions.size>=128)fail(503,'Demo capacity reached. Try again shortly.');
 const token=randomUUID(),name='campus_'+token.replaceAll('-','');
 s={name,store:scope(name),at:Date.now(),writes:0};
 sessions.set(token,s);
 try{await db.exec('create schema '+name);await initializeCampus(s.store)}catch(e){sessions.delete(token);throw e}
 res.setHeader('Set-Cookie','campus='+token+'; HttpOnly; SameSite=Strict; Path=/'+(process.env.RENDER?'; Secure':''));
 }
 res.setHeader('Cache-Control','no-store');
 }
 res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(bytes);return;
}
const s=session(req);if(!s)fail(401,'Reload the website for a fresh demo session.');
s.at=Date.now();const method=req.method;
let input={};
if(method==='POST'){
 if(req.headers.origin!==((process.env.RENDER?'https':'http')+'://'+req.headers.host))fail(403,'Origin unavailable');
 if(++s.writes>200)fail(429,'Session limit reached');
 let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>8192)fail(413,'Request too large');parts.push(part)}
 try{input=JSON.parse(Buffer.concat(parts).toString())}catch{fail(400,'Invalid JSON')}
}
const [, ,group,target,action]=path.split('/');
let op;
if(group==='workspaces'&&target===workspace){
 if(method==='GET'&&Object.hasOwn(wRoutes,action))op=wRoutes[action];
 if(method==='POST'&&action==='records')op='createRecord';
 if(op==='list_tasks')input={workspaceId:target};
}else if(method==='POST')op=mutations[group+'/'+action];
if(!op)fail(404,'Unknown route');
const out=await operate(s.store,id(3),op,target,input);
if(op==='reviseRecord'&&target===requirement&&out.revision===2){
 // Deterministic demo actor operations have stable keys on an HTTP retry.
 const taskId=id(10),actor=id(5);
 await operate(s.store,actor,'claim_task',taskId,{taskId,operationId:id(101)});
 for(const [rev,body] of [[1,'Scripted reviewer: form still uses fullName'],[2,'Scripted reviewer: form now uses displayName']])
 await operate(s.store,actor,'submit_result',taskId,{taskId,operationId:id(101+rev),body,sources:[{recordId:requirement,revision:rev}]});
}
res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({success:true,data:out}));
}catch(e){res.statusCode=e.status??(e.name==='ZodError'?400:500);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:false,error:{code:'REQUEST_FAILED',message:res.statusCode===500?'Service unavailable':e.message}}))}
});
setInterval(async()=>{for(const [key,s] of sessions)if(Date.now()-s.at>3600000){sessions.delete(key);await db.exec('drop schema '+s.name+' cascade').catch(()=>{})}},60000).unref();
server.listen(Number(process.env.PORT??8080),'0.0.0.0');
