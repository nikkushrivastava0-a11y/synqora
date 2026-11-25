// Temporary authenticated relay: only the SYNQORA workspace API is exposed.
// Run on the same computer as the existing Vite demo. No database reset or new AI calls.
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
const secret=process.env.SYNQORA_DEMO_PASSWORD||'';
if(secret.length<24)throw Error('Set SYNQORA_DEMO_PASSWORD to a strong random password (24+ characters).');
const expected=Buffer.from(secret);
const read=/^\/api\/workspaces\/[0-9a-f-]{36}\/(overview|agents|tasks|records|events|benchmarks|conflicts|impact|approvals)$/i;
const write=/^\/api\/(workspaces\/[0-9a-f-]{36}\/(plan|review|records)|records\/[0-9a-f-]{36}\/revisions|conflicts\/[0-9a-f-]{36}\/resolve|approvals\/[0-9a-f-]{36}\/decision)$/i;
const base='http://127.0.0.1:4173';
function authorized(req){const value=req.headers['x-synqora-relay-token'];if(typeof value!=='string')return false;const b=Buffer.from(value);return b.length===expected.length&&timingSafeEqual(b,expected);}
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const fail=(status,message)=>{res.statusCode=status;res.end(JSON.stringify({success:false,error:{code:'RELAY_ERROR',message}}));};
 if(!authorized(req))return fail(401,'Relay authorization required.');
 const method=req.method,route=req.url||'';
 if(!(method==='GET'?read.test(route):method==='POST'&&write.test(route)))return fail(404,'Route unavailable.');
 try{
  const parts=[];let size=0;
  if(method==='POST'){for await(const part of req){size+=part.length;if(size>65536)return fail(413,'Request too large.');parts.push(part);}}
  const remote=await fetch(base+route,{method,redirect:'error',signal:AbortSignal.timeout(140000),headers:{'Content-Type':'application/json',Origin:base},body:method==='POST'?Buffer.concat(parts):undefined});
  const body=await remote.text();JSON.parse(body);res.statusCode=remote.status;res.end(body);
 }catch{return fail(502,'Local SYNQORA backend unavailable.');}
});
server.listen(4318,'127.0.0.1',()=>console.log('Authenticated SYNQORA relay ready on 127.0.0.1:4318'));
