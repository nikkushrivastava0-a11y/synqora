import pg from 'pg';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {initializeCampus,operate,inputs,id,workspace} from '../backend/mcp/campus.mjs';
import {planInput} from '../backend/mcp/gpt-planner.mjs';
import {generatePlan} from '../backend/mcp/free-planner-adapter.mjs';
import {reviewPlan,reviewInput} from '../backend/mcp/gemini-reviewer.mjs';
const {Pool}=pg;
const fail=(status,message)=>Object.assign(new Error(message),{status});
let pool,ready;
function database(){
  if(!process.env.DATABASE_URL)throw fail(503,'Hosted PostgreSQL is not configured.');
  pool??=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
  const db={async transaction(fn){
    const c=await pool.connect();
    try{await c.query('BEGIN');await c.query('select pg_advisory_xact_lock(76432019)');const result=await fn({query:(sql,args)=>c.query(sql,args),exec:(sql)=>c.query(sql)});await c.query('COMMIT');return result;}
    catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }};
  ready??=initializeCampus(db).catch(e=>{ready=undefined;throw e;});
  return ready;
}
const reads={overview:'overview',agents:'agents',records:'records',tasks:'list_tasks',impact:'impact',conflicts:'conflicts',approvals:'approvals',events:'events',benchmarks:'benchmarks'};
const writes={'records/revisions':'reviseRecord','conflicts/resolve':'resolveConflict','approvals/decision':'decideApproval'};
const password=()=>process.env.SYNQORA_DEMO_PASSWORD||'';
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function sign(value){return createHmac('sha256',password()).update('synqora:'+value).digest('hex');}
function authenticated(req){const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('synqora_session='))?.slice(16);if(password().length<16||!token)return false;const [exp,signature]=token.split('.');return /^\d+$/.test(exp)&&Number(exp)>Date.now()&&typeof signature==='string'&&equal(signature,sign(exp));}
function sameOrigin(req){const host=req.headers.host;return typeof host==='string'&&req.headers.origin==='https://'+host&&req.headers['sec-fetch-site']!=='cross-site';}
async function bodyOf(req){let b=req.body;if(b===undefined){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>65536)throw fail(413,'Request too large');parts.push(part);}b=Buffer.concat(parts).toString();}if(typeof b==='string'||Buffer.isBuffer(b)){if(Buffer.byteLength(b)>65536)throw fail(413,'Request too large');try{b=JSON.parse(b.toString());}catch{throw fail(400,'Invalid JSON');}}if(!b||typeof b!=='object'||Array.isArray(b)||Buffer.byteLength(JSON.stringify(b))>65536)throw fail(400,'Invalid input');return b;}
const relayURL=()=>{
  const raw=process.env.SYNQORA_RELAY_URL;
  if(!raw)return null;
  const u=new URL(raw);
  if(u.protocol!=='https:'||! /^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname)||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw fail(503,'Invalid relay URL.');
  if(password().length<24)throw fail(503,'Configure a strong relay operator password.');
  return u.origin;
};
async function relayRequest(route,method,body){
  const base=relayURL();
  const allowedRead=/^workspaces\/[0-9a-f-]{36}\/(overview|agents|tasks|records|events|benchmarks|conflicts|impact|approvals)$/i;
  const allowedWrite=/^(workspaces\/[0-9a-f-]{36}\/(plan|review|records)|records\/[0-9a-f-]{36}\/revisions|conflicts\/[0-9a-f-]{36}\/resolve|approvals\/[0-9a-f-]{36}\/decision)$/i;
  if(!(method==='GET'?allowedRead.test(route):method==='POST'&&allowedWrite.test(route)))throw fail(404,'Route unavailable');
  try{
    const response=await fetch(base+'/api/'+route,{method,redirect:'error',signal:AbortSignal.timeout(125000),headers:{'x-synqora-relay-token':password(),'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
    const payload=await response.json();
    if(typeof payload.success!=='boolean')throw Error('Bad relay response');
    return {status:response.status,payload};
  }catch{throw fail(502,'Local demo relay unavailable. Keep the laptop and tunnel running.');}
}
async function exclusive(name,fn){const c=await pool.connect();try{const key=name==='plan'?76432020:76432021;const r=await c.query('select pg_try_advisory_lock($1) as locked',[key]);if(!r.rows[0].locked)throw fail(409,'An AI job is already running.');try{return await fn();}finally{await c.query('select pg_advisory_unlock($1)',[key]);}}finally{c.release();}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify({success:true,data}));};
  try{
    const url=new URL(req.url,'https://localhost');
    const route=req.query?.route??url.searchParams.get('route')??url.pathname.replace(/^\/api\//,'');
    if(typeof route!=='string'||! /^[a-zA-Z0-9/-]+$/.test(route))throw fail(404,'Route unavailable');
    const method=req.method;
    if(route==='status'&&method==='GET'){
      let relayOnline=false;
      if(process.env.SYNQORA_RELAY_URL){try{const r=await relayRequest('workspaces/'+workspace+'/overview','GET');relayOnline=r.status===200&&r.payload.success===true;}catch{}}
      return reply(200,{databaseConfigured:relayOnline||!!process.env.DATABASE_URL,relayOnline,authenticated:authenticated(req),writesConfigured:password().length>=16,aiConfigured:!!process.env.OPENROUTER_API_KEY&&!!process.env.GEMINI_API_KEY&&process.env.SYNQORA_GEMINI_FREE_CONFIRMED==='1'});
    }
    if(method==='POST'&&!sameOrigin(req))throw fail(403,'Same-origin request required');
    if(route==='login'&&method==='POST'){const b=await bodyOf(req);if(password().length<16||typeof b.password!=='string'||!equal(b.password,password()))throw fail(401,'Invalid demo password');const exp=String(Date.now()+8*60*60*1000);res.setHeader('Set-Cookie','synqora_session='+exp+'.'+sign(exp)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');return reply(200,{authenticated:true});}
    if(route==='logout'&&method==='POST'){res.setHeader('Set-Cookie','synqora_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return reply(200,{authenticated:false});}
    if(!['GET','POST'].includes(method))throw fail(405,'Method unavailable');
    if(method==='POST'&&!authenticated(req))throw fail(401,'Sign in using the demo password to change the workspace.');
    const [group,target,action,...rest]=route.split('/');if(rest.length||!target||!action)throw fail(404,'Route unavailable');
    if(!/^[0-9a-f-]{36}$/i.test(target))throw fail(404,'Route unavailable');
    const body=method==='POST'?await bodyOf(req):{};
    if(process.env.SYNQORA_RELAY_URL){
      const remote=await relayRequest(route,method,body);
      res.statusCode=remote.status;
      return res.end(JSON.stringify(remote.payload));
    }
    const db=await database();
    if(group==='workspaces'&&target===workspace&&action==='plan'&&method==='POST'){
      if(!process.env.OPENROUTER_API_KEY)throw fail(503,'Planner API key not configured.');
      const input=planInput.parse(body);
      return reply(200,await exclusive('plan',async()=>{try{const previous=await operate(db,id(3),'resume_task',null,{operationId:input.operationId});if(previous.prompt!==input.prompt||!previous.planId)throw fail(409,'Operation mismatch');return previous;}catch(e){if(e.status!==404)throw e;}const result=await generatePlan(input.prompt);return operate(db,id(3),'saveDynamicPlan',workspace,{...input,...result});}));
    }
    if(group==='workspaces'&&target===workspace&&action==='review'&&method==='POST'){
      const input=reviewInput.parse(body);
      return reply(200,await exclusive('review',()=>reviewPlan({input,call:(op,args)=>operate(db,id(5),op,args.workspaceId??args.taskId??args.recordId??null,args)})));
    }
    let op;if(group==='workspaces'&&target===workspace&&method==='GET'&&Object.hasOwn(reads,action)){op=reads[action];if(op==='list_tasks')body.workspaceId=target;}
    else if(group==='workspaces'&&target===workspace&&method==='POST'&&action==='records')op='createRecord';
    else if(method==='POST'&&Object.hasOwn(writes,group+'/'+action))op=writes[group+'/'+action];
    if(!op)throw fail(404,'Route unavailable');
    return reply(200,await operate(db,id(3),op,target,body));
  }catch(e){const status=e.name==='ZodError'||e.code==='22P02'?400:e.status||500;res.statusCode=status;res.end(JSON.stringify({success:false,error:{code:'REQUEST_FAILED',message:status===500?'Hosted database request failed':e.name==='ZodError'?'Invalid request':e.message}}));}
}
