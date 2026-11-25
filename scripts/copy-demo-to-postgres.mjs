// Copy a consistent offline snapshot of the local judge database into a dedicated,
// empty/untouched hosted database. Never operate on the running PGlite directory.
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { initializeCampus, id, workspace } from '../backend/mcp/campus.mjs';
const snapshot=process.argv[2];
if(!snapshot||!process.env.DATABASE_URL||!process.argv.includes('--copy-to-empty-demo-db'))throw Error('Supply a closed-server database snapshot, DATABASE_URL, and --copy-to-empty-demo-db.');
await access(resolve(snapshot,'PG_VERSION'));
const spec=[
['campus_users',['id','workspace','name','role'],[]],
['records',['id','workspace','title'],[]],
['record_revisions',['record','revision','body'],[]],
['tasks',['id','workspace','title','status','owner'],[]],
['task_sources',['task','record'],[]],
['task_dependencies',['parent','child'],[]],
['task_claims',['task','actor','expires'],[]],
['agent_results',['id','task','actor','body','sources','state','created'],['sources']],
['conflicts',['id','workspace','task','result','used','current','state'],['used','current']],
['approvals',['id','workspace','conflict','result','state','decider','reason','sources'],['sources']],
['operations',['id','actor','digest','response'],['response']],
['audit_events',['id','workspace','at','action','actor','agent','operation','sources','reason'],['sources']],
['impact',['seq','workspace','source','task','path'],['source','path']],
['result_reviews',['review','artifact','revision'],[]],
];
const source=new PGlite(resolve(snapshot));
let rows;
try{rows=await source.transaction(async tx=>{const out={};for(const [table,columns] of spec)out[table]=(await tx.query('select '+columns.map(c=>'"'+c+'"').join(',')+' from '+table)).rows;return out;});}finally{await source.close();}
if(!rows.agent_results.length||!rows.records.some(r=>r.title==='AI project planning result')||!rows.records.some(r=>r.title==='Independent AI plan review result'))throw Error('Snapshot does not contain the real saved two-agent demo. No cloud data changed.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
const adapter={async transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');await c.query('select pg_advisory_xact_lock(76432019)');const out=await fn({query:(sql,args)=>c.query(sql,args),exec:sql=>c.query(sql)});await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}};
try{
 await initializeCampus(adapter);
 await adapter.transaction(async tx=>{
 const counts={};for(const [table] of spec)counts[table]=Number((await tx.query('select count(*) as n from '+table)).rows[0].n);
 const expected={campus_users:3,records:1,record_revisions:1,tasks:5,task_sources:2,task_dependencies:1,task_claims:0,agent_results:0,conflicts:0,approvals:0,operations:0,audit_events:0,impact:0,result_reviews:0};
 if(Object.keys(expected).some(k=>expected[k]!==counts[k]))throw Error('Target database is not the untouched demo seed. Refusing to replace existing data.');
 const base=await tx.query('select r.id,r.workspace,r.title,v.body,v.revision from records r join record_revisions v on v.record=r.id');
 if(base.rows[0]?.id!==id(2)||base.rows[0]?.workspace!==workspace||base.rows[0]?.title!=='Registration API'||base.rows[0]?.body!=='Register using fullName'||base.rows[0]?.revision!==1)throw Error('Target seed mismatch; no data changed.');
 await tx.exec('truncate '+spec.map(([t])=>t).join(',')+' restart identity');
 for(const [table,cols,json] of spec){const sql='insert into '+table+' ('+cols.map(c=>'"'+c+'"').join(',')+') '+(table==='impact'?'overriding system value ':'')+'values ('+cols.map((_,i)=>'$'+(i+1)).join(',')+')';for(const row of rows[table])await tx.query(sql,cols.map(c=>row[c]===null?null:json.includes(c)?JSON.stringify(row[c]):row[c]));}
 await tx.exec("select setval(pg_get_serial_sequence('impact','seq'),coalesce((select max(seq) from impact),1),exists(select 1 from impact))");
 for(const [table] of spec){const n=Number((await tx.query('select count(*) as n from '+table)).rows[0].n);if(n!==rows[table].length)throw Error('Copy validation failed for '+table);}
 });
 console.log('Verified copy: '+rows.records.length+' records, '+rows.tasks.length+' tasks, '+rows.agent_results.length+' real saved agent results. No AI calls made.');
}finally{await pool.end();}
